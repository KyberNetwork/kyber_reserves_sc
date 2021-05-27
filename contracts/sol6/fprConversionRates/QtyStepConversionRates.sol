pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/Utils.sol";

import "../IConversionRates.sol";
import "./SimpleVolumeImbalanceRecorder.sol";

contract QtyStepConversionRates is IConversionRates, SimpleVolumeImbalanceRecorder, Utils {
    int256 internal constant MAX_BPS_ADJUSTMENT = 10**11; // 1B %
    int256 internal constant MIN_BPS_ADJUSTMENT = -100 * 100; // cannot go down by more than 100%
    // step data constant
    uint256 internal constant MAX_STEPS_IN_FUNCTION = 13;
    int256 internal constant MAX_INT128 = 2**127 - 1;
    int256 internal constant MIN_INT128 = -1 * 2**127;
    uint256 internal constant MAX_UINT104 = 2**104 - 1;
    // compact data constant
    uint256 internal constant NUM_TOKENS_IN_COMPACT_DATA = 14;

    /// @dev data is compressed into 1 word
    struct TokenData {
        bool listed; // was added to reserve
        bool enabled; // whether trade is enabled
        // position in the compact data
        uint16 compactDataArrayIndex;
        uint16 compactDataFieldIndex;
        // rate data. base and changes according to quantity and reserve balance.
        // generally speaking. Sell rate is 1 / buy rate i.e. the buy in the other direction.

        // rate <= max_rate = 10^25 < 2^104 (10^31)
        uint104 baseBuyRate; // in PRECISION units
        uint104 baseSellRate; // in PRECISION units
    }

    /// @dev data is compressed into 1 word
    struct StepFunction {
        int128 x;
        int128 y;
    }
    /// @dev this is a replacement for StepFunction[]
    /// @dev if we use StepFunction[], solitidy compiler will not compress x, y into 1 word
    struct StepFunctions {
        uint256 length;
        mapping(uint256 => StepFunction) data;
    }

    /// @dev compact data is reflect the rate change from base rate
    /// @dev this way we can set new rate from 14 token with only 1 sstore
    struct TokenRatesCompactData {
        bytes14 buy; // each byte is the change buy rate from baseBuyRate in 10 bps
        bytes14 sell; // each byte is the change sell rate from baseSellRate in 10 bps
        uint32 blockNumber;
    }

    uint256 internal numCompactData = 0;
    mapping(uint256 => TokenRatesCompactData) internal tokenRatesCompactData;
    uint256 public numTokensInCurrentCompactData = 0;

    uint256 public validRateDurationInBlocks = 10; // rates are valid for this amount of blocks
    IERC20Ext[] internal listedTokens;
    mapping(IERC20Ext => TokenData) internal tokenData;
    mapping(IERC20Ext => StepFunctions) internal tokenSellQtySteps;
    mapping(IERC20Ext => StepFunctions) internal tokenBuyQtySteps;

    address public reserveContract;

    event AddToken(
        IERC20Ext indexed token,
        uint16 compactDataArrayIndex,
        uint16 compactDataFieldIndex
    );
    event EnableTokenTrade(IERC20Ext indexed token, bool isEnabled);
    event SetReserveContract(address reserve);

    constructor(address _admin) public SimpleVolumeImbalanceRecorder(_admin) {}

    function addToken(IERC20Ext token) external onlyAdmin {
        require(!tokenData[token].listed, "listed token");
        tokenData[token].listed = true;
        listedTokens.push(token);

        if (numTokensInCurrentCompactData == 0) {
            numCompactData += 1;
        }

        tokenData[token].compactDataArrayIndex = uint16(numCompactData - 1);
        tokenData[token].compactDataFieldIndex = uint16(numTokensInCurrentCompactData);

        numTokensInCurrentCompactData =
            (numTokensInCurrentCompactData + 1) %
            NUM_TOKENS_IN_COMPACT_DATA;

        setGarbageToVolumeRecorder(token);
        getSetDecimals(token);

        emit AddToken(
            token,
            tokenData[token].compactDataArrayIndex,
            tokenData[token].compactDataFieldIndex
        );
    }

    /// @dev this function set a batch of token with the same slot for compact data
    /// @dev this is a simple version of setBaseRate
    /// @dev If user want to use this for more than 14 token, they should use setBaseRate
    function setBaseRateWithEmptyCompactData(
        IERC20Ext[] calldata tokens,
        uint256[] calldata baseBuy,
        uint256[] calldata baseSell,
        uint256 blockNumber
    ) external onlyOperator {
        uint256 compactDataArrayIndex = uint256(-1);
        for (uint256 ind = 0; ind < tokens.length; ind++) {
            IERC20Ext token = tokens[ind];
            TokenData memory data = tokenData[token];
            require(data.listed, "unlisted token");
            if (compactDataArrayIndex == uint256(-1)) {
                compactDataArrayIndex = data.compactDataArrayIndex;
            }
            require(
                compactDataArrayIndex == data.compactDataArrayIndex,
                "CompactData from different slot"
            );
        }
        // fill in dummy data to compact data
        bytes14[] memory buy = new bytes14[](1);
        buy[0] = bytes14(0);
        bytes14[] memory sell = new bytes14[](1);
        sell[0] = bytes14(0);
        uint256[] memory indices = new uint256[](1);
        indices[0] = compactDataArrayIndex;
        setBaseRate(tokens, baseBuy, baseSell, buy, sell, blockNumber, indices);
    }

    function setQtyStepFunction(
        IERC20Ext token,
        int256[] calldata xBuy,
        int256[] calldata yBuy,
        int256[] calldata xSell,
        int256[] calldata ySell
    ) external onlyOperator {
        require(xBuy.length == yBuy.length, "xBuy-yBuy length mismatch");
        require(xSell.length == ySell.length, "xSell-ySell length mismatch");
        require(xBuy.length <= MAX_STEPS_IN_FUNCTION, "xBuy too big");
        require(xSell.length <= MAX_STEPS_IN_FUNCTION, "xSell too big");
        require(tokenData[token].listed, "unlisted token");

        tokenBuyQtySteps[token].length = xBuy.length;
        for (uint256 i = 0; i < xBuy.length; i++) {
            require(yBuy[i] <= MAX_BPS_ADJUSTMENT, "yBuy too high");
            require(yBuy[i] >= MIN_BPS_ADJUSTMENT, "yBuy too low");
            tokenBuyQtySteps[token].data[i] = StepFunction(
                safeInt128(xBuy[i]),
                safeInt128(yBuy[i])
            );
        }
        tokenSellQtySteps[token].length = xSell.length;
        for (uint256 i = 0; i < xSell.length; i++) {
            require(ySell[i] <= MAX_BPS_ADJUSTMENT, "ySell too high");
            require(ySell[i] >= MIN_BPS_ADJUSTMENT, "ySell too low");
            tokenSellQtySteps[token].data[i] = StepFunction(
                safeInt128(xSell[i]),
                safeInt128(ySell[i])
            );
        }
    }

    function setValidRateDurationInBlocks(uint256 duration) external onlyAdmin {
        validRateDurationInBlocks = duration;
    }

    function enableTokenTrade(IERC20Ext token) external onlyAdmin {
        require(tokenData[token].listed, "unlisted token");
        require(
            tokenControlInfo[token].minimalRecordResolution != 0,
            "tokenControlInfo is required"
        );
        tokenData[token].enabled = true;

        emit EnableTokenTrade(token, true);
    }

    function disableTokenTrade(IERC20Ext token) external onlyOperator {
        require(tokenData[token].listed, "unlisted token");
        tokenData[token].enabled = false;

        emit EnableTokenTrade(token, false);
    }

    function setReserveAddress(address reserve) external onlyAdmin {
        reserveContract = reserve;

        emit SetReserveContract(reserve);
    }

    function recordImbalance(
        IERC20Ext token,
        int256 buyAmount,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) external override {
        require(msg.sender == reserveContract, "sender is not reserve");
        if (rateUpdateBlock == 0) {
            rateUpdateBlock = getRateUpdateBlock(token);
        }
        return addImbalance(token, buyAmount, rateUpdateBlock, currentBlock);
    }

    function getRate(
        IERC20Ext token,
        uint256 currentBlockNumber,
        bool buy,
        uint256 qty
    ) external view override returns (uint256) {
        TokenData memory data = tokenData[token];
        // check if trade is enabled
        // if trade is enable, minimalRecordResolution != 0
        if (!data.enabled) return 0;

        (uint256 rate, uint256 updateRateBlock) =
            getRateWithoutImbalance(data, currentBlockNumber, buy);
        if (rate == 0) {
            return 0;
        }

        // check imbalance
        (int256 totalImbalanceInResolution, int256 blockImbalanceInResolution) =
            getImbalanceInResolution(token, updateRateBlock, currentBlockNumber);

        // calculate actual rate
        TokenControlInfo memory tkInfo = tokenControlInfo[token];
        int256 imbalanceQty;
        int256 extraBps;
        if (buy) {
            // compute token qty
            qty = getTokenQty(token, qty, rate);
            imbalanceQty = int256(qty) / int256(tkInfo.minimalRecordResolution);
            totalImbalanceInResolution += imbalanceQty;

            // add qty overhead
            extraBps = executeStepFunction(tokenBuyQtySteps[token], int256(qty));
            rate = addBps(rate, extraBps);
        } else {
            // compute token qty
            imbalanceQty = (-1 * int256(qty)) / int256(tkInfo.minimalRecordResolution);
            totalImbalanceInResolution += imbalanceQty;

            // add qty overhead
            extraBps = executeStepFunction(tokenSellQtySteps[token], int256(qty));
            rate = addBps(rate, extraBps);
        }

        if (abs(totalImbalanceInResolution) >= uint256(tkInfo.maxTotalImbalanceInResolution)) {
            return 0;
        }
        if (
            abs(blockImbalanceInResolution + imbalanceQty) >=
            uint256(tkInfo.maxPerBlockImbalanceInResolution)
        ) {
            return 0;
        }

        return rate;
    }

    function getBasicRate(IERC20Ext token, bool buy) external view returns (uint256) {
        if (buy) {
            return tokenData[token].baseBuyRate;
        } else {
            return tokenData[token].baseSellRate;
        }
    }

    function getCompactData(IERC20Ext token)
        external
        view
        returns (
            uint256 arrayIndex,
            uint256 fieldOffset,
            int8 buyRateUpdate,
            int8 sellRateUpdate
        )
    {
        require(tokenData[token].listed, "unlisted token");

        arrayIndex = uint256(tokenData[token].compactDataArrayIndex);
        fieldOffset = uint256(tokenData[token].compactDataFieldIndex);

        TokenRatesCompactData memory compactData = tokenRatesCompactData[arrayIndex];
        buyRateUpdate = int8(compactData.buy[fieldOffset]);
        sellRateUpdate = int8(compactData.sell[fieldOffset]);
    }

    function getTokenBasicData(IERC20Ext token) external view returns (bool listed, bool enabled) {
        return (tokenData[token].listed, tokenData[token].enabled);
    }

    /// @dev for compatible with previous version, this also returns dummy data for imbalance
    function getStepFunctionData(
        IERC20Ext token,
        uint256 command,
        uint256 param
    ) external view returns (int256) {
        if (command == 0 || command == 2) {
            return int256(tokenBuyQtySteps[token].length);
        } else if (command == 1) {
            return tokenBuyQtySteps[token].data[param].x;
        } else if (command == 3) {
            return tokenBuyQtySteps[token].data[param].y;
        } else if (command == 4 || command == 6) {
            return int256(tokenSellQtySteps[token].length);
        } else if (command == 5) {
            return tokenSellQtySteps[token].data[param].x;
        } else if (command == 7) {
            return tokenSellQtySteps[token].data[param].y;
        } else if (
            command == 8 ||
            command == 10 ||
            command == 12 ||
            command == 14 ||
            command == 9 ||
            command == 11 ||
            command == 13 ||
            command == 15
        ) {
            revert("imbalance steps not supported.");
        }
        revert("invalid command");
    }

    function getListedTokens() external view returns (IERC20Ext[] memory) {
        return listedTokens;
    }

    function setBaseRate(
        IERC20Ext[] memory tokens,
        uint256[] memory baseBuy,
        uint256[] memory baseSell,
        bytes14[] memory buy,
        bytes14[] memory sell,
        uint256 blockNumber,
        uint256[] memory indices
    ) public onlyOperator {
        require(tokens.length == baseBuy.length, "tokens-baseBuy: mismatch length");
        require(tokens.length == baseSell.length, "tokens-baseSell: mismatch length");

        for (uint256 ind = 0; ind < tokens.length; ind++) {
            IERC20Ext token = tokens[ind];
            require(tokenData[token].listed, "unlisted token");
            tokenData[token].baseBuyRate = safeUint104(baseBuy[ind]);
            tokenData[token].baseSellRate = safeUint104(baseSell[ind]);
        }

        setCompactData(buy, sell, blockNumber, indices);
    }

    function setCompactData(
        bytes14[] memory buy,
        bytes14[] memory sell,
        uint256 blockNumber,
        uint256[] memory indices
    ) public onlyOperator {
        require(buy.length == sell.length, "buy-sell: mismatch length");
        require(indices.length == buy.length, "buy-indices: mismatch length");
        require(blockNumber <= 0xFFFFFFFF, "overflow block number");

        for (uint256 i = 0; i < indices.length; i++) {
            require(indices[i] < numCompactData, "invalid indices");
            tokenRatesCompactData[indices[i]] = TokenRatesCompactData(
                buy[i],
                sell[i],
                uint32(blockNumber)
            );
        }
    }

    function getRateUpdateBlock(IERC20Ext token) public view returns (uint256) {
        uint256 compactDataArrayIndex = tokenData[token].compactDataArrayIndex;
        return tokenRatesCompactData[compactDataArrayIndex].blockNumber;
    }

    function getRateWithoutImbalance(
        TokenData memory data,
        uint256 currentBlockNumber,
        bool buy
    ) internal view returns (uint256 rate, uint256 updateRateBlock) {
        // get rate update block
        TokenRatesCompactData memory compactData =
            tokenRatesCompactData[data.compactDataArrayIndex];
        updateRateBlock = compactData.blockNumber;
        if (currentBlockNumber >= uint256(compactData.blockNumber) + validRateDurationInBlocks) {
            return (0, 0); // rate is expired
        }
        rate = buy ? uint256(data.baseBuyRate) : uint256(data.baseSellRate);
        // add rate update
        uint256 fieldOffset = uint256(data.compactDataFieldIndex);
        int8 rateUpdate =
            buy ? int8(compactData.buy[fieldOffset]) : int8(compactData.sell[fieldOffset]);
        rate = addBps(rate, int256(rateUpdate) * 10);
    }

    function getTokenQty(
        IERC20Ext token,
        uint256 ethQty,
        uint256 rate
    ) internal view returns (uint256) {
        uint256 dstDecimals = getDecimals(token);
        uint256 srcDecimals = ETH_DECIMALS;

        return calcDstQty(ethQty, srcDecimals, dstDecimals, rate);
    }

    function executeStepFunction(StepFunctions storage f, int256 x)
        internal
        view
        returns (int256)
    {
        uint256 len = f.length;
        StepFunction memory step;
        for (uint256 ind = 0; ind < len; ind++) {
            step = f.data[ind];
            if (x <= step.x) return int256(step.y);
        }
        return int256(step.y);
    }

    function addBps(uint256 rate, int256 bps) internal pure returns (uint256) {
        require(rate <= MAX_RATE, "invalid rate");
        require(bps >= MIN_BPS_ADJUSTMENT, "bps too low");
        require(bps <= MAX_BPS_ADJUSTMENT, "bps too high");
        return (rate * uint256(int256(BPS) + bps)) / BPS;
    }

    function abs(int256 x) internal pure returns (uint256) {
        if (x < 0) return uint256(-1 * x);
        else return uint256(x);
    }

    function safeInt128(int256 a) internal pure returns (int128) {
        require((a <= MAX_INT128) && (a >= MIN_INT128), "safeInt128: type cast overflow");
        return int128(a);
    }

    function safeUint104(uint256 a) internal pure returns (uint104) {
        require(a <= MAX_UINT104, "safeUint104: type cast overflow");
        return uint104(a);
    }
}
