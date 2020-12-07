pragma solidity 0.6.6;

import "../ICRMulQuotes.sol";
import "../VolumeImbalanceRecorder.sol";


contract ConversionRatesMulQuotes is ICRMulQuotes, VolumeImbalanceRecorder {
    struct StepFunction {
        int256[] x; // quantity for each step. Quantity of each step includes previous steps.
        int256[] y; // rate change per quantity step  in bps.
    }

    struct TokenData {
        bool listed;  // was added to reserve
        bool enabled; // whether trade is enabled

        // position in the compact data
        uint128 compactDataArrayIndex;
        uint128 compactDataFieldIndex;

        uint baseBuyRate; 
        uint baseSellRate;
        StepFunction buyRateQtyStepFunction;
        StepFunction sellRateQtyStepFunction;
        StepFunction buyRateImbalanceStepFunction;
        StepFunction sellRateImbalanceStepFunction;
    }

    uint256 public validRateDurationInBlocks = 10; // rates are valid for this amount of blocks
    mapping(IERC20Ext => TokenData) internal tokenData;
    IERC20Ext[] internal listedTokens;
    bytes32[] internal tokenRatesCompactData;
    address public reserveContract;

    IERC20Ext public primaryQuote;
    IERC20Ext[] public secondaryQuotes;
    mapping(IERC20Ext => uint128) public quoteIndexes;
    uint128 internal constant NON_QUOTE_INDEX = 0;
    uint128 internal constant PRIMARY_QUOTE_INDEX = 1;

    uint128 public numTokensInCurrentCompactData;
    uint128 constant internal NUM_TOKENS_IN_COMPACT_DATA = 14;
    uint256 constant internal BYTES_14_OFFSET = 2 ** (8 * NUM_TOKENS_IN_COMPACT_DATA);
    uint constant internal MAX_STEPS_IN_FUNCTION = 10;
    int constant internal MAX_IMBALANCE = 2 ** 255 - 1;
    int constant internal MIN_BPS_ADJUSTMENT = -100 * 100; // cannot go down by more than 100%
    int constant internal MAX_BPS_ADJUSTMENT = 100 * 100;
    
    constructor(address _admin, IERC20Ext _primaryQuote) public VolumeImbalanceRecorder(_admin) {
        primaryQuote = _primaryQuote;
        quoteIndexes[_primaryQuote] = PRIMARY_QUOTE_INDEX;
        getSetDecimals(_primaryQuote);
    }

    function addToken(IERC20Ext token) external onlyAdmin {

        require(!tokenData[token].listed, "already listed");
        tokenData[token].listed = true;
        listedTokens.push(token);

        if (numTokensInCurrentCompactData == 0) {
            tokenRatesCompactData.push(0x0); // add new structure
        }

        tokenData[token].compactDataArrayIndex = uint128(tokenRatesCompactData.length - 1);
        tokenData[token].compactDataFieldIndex = numTokensInCurrentCompactData;

        numTokensInCurrentCompactData = 
            (numTokensInCurrentCompactData + 1) % NUM_TOKENS_IN_COMPACT_DATA;

        setGarbageToVolumeRecorder(token);

        getSetDecimals(token);
    }

    function swapTokenCompactDataIndexes(
        IERC20Ext token1,
        IERC20Ext token2
    ) external onlyAdmin {
        require(tokenData[token1].listed, "not listed");
        require(tokenData[token2].listed, "not listed");

        uint128 tempArrayIndex = tokenData[token1].compactDataArrayIndex;
        uint128 tempFieldIndex = tokenData[token1].compactDataFieldIndex;

        tokenData[token1].compactDataArrayIndex = tokenData[token2].compactDataArrayIndex;
        tokenData[token1].compactDataFieldIndex = tokenData[token2].compactDataFieldIndex;

        tokenData[token2].compactDataArrayIndex = tempArrayIndex;
        tokenData[token2].compactDataFieldIndex = tempFieldIndex;
    }

    function setPrimaryQuote(IERC20Ext _primaryQuote) external onlyAdmin {
        // set current primary quote indexes to non-quote
        quoteIndexes[primaryQuote] = NON_QUOTE_INDEX;

        primaryQuote = _primaryQuote;
        quoteIndexes[_primaryQuote] = PRIMARY_QUOTE_INDEX;
        getSetDecimals(_primaryQuote);
    }

    function setSecondaryQuotes(IERC20Ext[] calldata _secondaryQuotes) external onlyAdmin {
        // set current secondary quote indexes to non-quote
        uint8 i;
        for (i = 0; i < secondaryQuotes.length; i++) {
            quoteIndexes[secondaryQuotes[i]] = NON_QUOTE_INDEX;
        }

        // update secondary quotes
        secondaryQuotes = _secondaryQuotes;
        for (i = 0; i < secondaryQuotes.length; i++) {
            quoteIndexes[secondaryQuotes[i]] = uint128(PRIMARY_QUOTE_INDEX + i);
            getSetDecimals(secondaryQuotes[i]);
        }
    }

    function setBaseRate(
        IERC20Ext[] calldata tokens,
        uint[] calldata baseBuy,
        uint[] calldata baseSell,
        bytes14[] calldata buy,
        bytes14[] calldata sell,
        uint blockNumber,
        uint[] calldata indices
    )
        external
        onlyOperator
    {
        require(tokens.length == baseBuy.length, "bad token-baseBuy length");
        require(tokens.length == baseSell.length, "bad token-baseSell length");
        for (uint ind = 0; ind < tokens.length; ind++) {
            require(tokenData[tokens[ind]].listed, "token not listed");
            tokenData[tokens[ind]].baseBuyRate = baseBuy[ind];
            tokenData[tokens[ind]].baseSellRate = baseSell[ind];
        }

        setCompactData(buy, sell, blockNumber, indices);
    }

    function setCompactData(
        bytes14[] memory buy,
        bytes14[] memory sell,
        uint blockNumber,
        uint[] memory indices
    ) public onlyOperator {
        require(buy.length == sell.length, "bad buy-sell length");
        require(indices.length == buy.length, "bad buy-indices length");
        require(blockNumber <= 0xFFFFFFFF, "bad block number");

        for (uint i = 0; i < indices.length; i++) {
            require(indices[i] < tokenRatesCompactData.length, "bad index");
            uint data = 
                uint112(buy[i]) |
                uint112(sell[i]) * BYTES_14_OFFSET |
                (blockNumber * (BYTES_14_OFFSET * BYTES_14_OFFSET));
            tokenRatesCompactData[indices[i]] = bytes32(data);
        }
    }

    function setImbalanceStepFunction(
        IERC20Ext token,
        int[] memory xBuy,
        int[] memory yBuy,
        int[] memory xSell,
        int[] memory ySell
    )
        public
        virtual
        onlyOperator
    {
        require(xBuy.length == yBuy.length);
        require(xSell.length == ySell.length);
        require(xBuy.length <= MAX_STEPS_IN_FUNCTION);
        require(xSell.length <= MAX_STEPS_IN_FUNCTION);
        require(tokenData[token].listed);

        tokenData[token].buyRateImbalanceStepFunction = StepFunction(xBuy, yBuy);
        tokenData[token].sellRateImbalanceStepFunction = StepFunction(xSell, ySell);
    }

    /* solhint-disable code-complexity */
    function getStepFunctionData(IERC20Ext token, uint command, uint param) public view returns(int) {
        if (command == 0) return int(tokenData[token].buyRateQtyStepFunction.x.length);
        if (command == 1) return tokenData[token].buyRateQtyStepFunction.x[param];
        if (command == 2) return int(tokenData[token].buyRateQtyStepFunction.y.length);
        if (command == 3) return tokenData[token].buyRateQtyStepFunction.y[param];

        if (command == 4) return int(tokenData[token].sellRateQtyStepFunction.x.length);
        if (command == 5) return tokenData[token].sellRateQtyStepFunction.x[param];
        if (command == 6) return int(tokenData[token].sellRateQtyStepFunction.y.length);
        if (command == 7) return tokenData[token].sellRateQtyStepFunction.y[param];

        if (command == 8) return int(tokenData[token].buyRateImbalanceStepFunction.x.length);
        if (command == 9) return tokenData[token].buyRateImbalanceStepFunction.x[param];
        if (command == 10) return int(tokenData[token].buyRateImbalanceStepFunction.y.length);
        if (command == 11) return tokenData[token].buyRateImbalanceStepFunction.y[param];

        if (command == 12) return int(tokenData[token].sellRateImbalanceStepFunction.x.length);
        if (command == 13) return tokenData[token].sellRateImbalanceStepFunction.x[param];
        if (command == 14) return int(tokenData[token].sellRateImbalanceStepFunction.y.length);
        if (command == 15) return tokenData[token].sellRateImbalanceStepFunction.y[param];

        return 0;
    }

    function getRate(
        IERC20Ext src,
        IERC20Ext dest,
        uint256 currentBlockNumber,
        uint256 amount
    ) public view override returns(uint256) {
        uint128 srcQuoteIndex = quoteIndexes[src];
        uint128 destQuoteIndex = quoteIndexes[dest];

        // src == dest, return 0
        if (srcQuoteIndex == destQuoteIndex) return 0;

        if (srcQuoteIndex == PRIMARY_QUOTE_INDEX) {
            // primary -> secondary
            // primary -> non-quote
            // simple case, apply dest steps
            return calcRate(dest, currentBlockNumber, true, amount);
        } else if (srcQuoteIndex > PRIMARY_QUOTE_INDEX) {
            // src = secondary quote
            if (destQuoteIndex == PRIMARY_QUOTE_INDEX) {
                // secondary -> primary
                // apply src steps
                return calcRate(src, currentBlockNumber, false, amount);
            } else if (destQuoteIndex > PRIMARY_QUOTE_INDEX) {
                // secondary -> another secondary
                if (srcQuoteIndex > destQuoteIndex) {
                    // src lower ranked than dest
                    // apply src steps
                    return calcRate(src, currentBlockNumber, false, amount);
                } else {
                    // src higher ranked than dest
                    // apply dest steps
                    return calcRate(dest, currentBlockNumber, true, amount);
                }
            } else {
                // secondary -> non-quote
                // apply percentage of secondary steps?
                // apply non-quote
            }
        } else {
            if (destQuoteIndex == PRIMARY_QUOTE_INDEX) {
                // non-quote -> primary
                // apply non-quote steps
                return calcRate(src, currentBlockNumber, false, amount);
            } else if (destQuoteIndex > PRIMARY_QUOTE_INDEX) {
                // non-quote -> secondary
                // apply non-quote steps
                // apply percentage of secondary steps?
            } else {
                // non-quote -> non-quote
                // do we do non-quote -> primary -> non-quote?
                // or return 0?
            }
        }
    }

    /* solhint-disable function-max-lines */
    function calcRate(
        IERC20Ext token,
        uint currentBlockNumber,
        bool buy,
        uint qty
    ) public view returns(uint) {
        // check if trade is enabled
        if (!tokenData[token].enabled) return 0;
        if (tokenControlInfo[token].minimalRecordResolution == 0) return 0; // token control info not set

        // get rate update block
        bytes32 compactData = tokenRatesCompactData[tokenData[token].compactDataArrayIndex];

        uint updateRateBlock = getLast4Bytes(compactData);
        if (currentBlockNumber >= updateRateBlock + validRateDurationInBlocks) return 0; // rate is expired
        // check imbalance
        int totalImbalance;
        int blockImbalance;
        (totalImbalance, blockImbalance) = getImbalance(token, updateRateBlock, currentBlockNumber);

        // calculate actual rate
        int imbalanceQty;
        int extraBps;
        int8 rateUpdate;
        uint rate;

        if (buy) {
            // start with base rate
            rate = tokenData[token].baseBuyRate;

            // add rate update
            rateUpdate = getRateByteFromCompactData(compactData, token, true);
            extraBps = int(rateUpdate) * 10;
            rate = addBps(rate, extraBps);

            // compute token qty
            qty = getTokenQty(token, rate, qty);
            imbalanceQty = int(qty);
            totalImbalance += imbalanceQty;

            // add qty overhead
            extraBps = executeStepFunction(tokenData[token].buyRateQtyStepFunction, int(qty));
            rate = addBps(rate, extraBps);

            // add imbalance overhead
            extraBps = executeStepFunction(tokenData[token].buyRateImbalanceStepFunction, totalImbalance);
            rate = addBps(rate, extraBps);
        } else {
            // start with base rate
            rate = tokenData[token].baseSellRate;

            // add rate update
            rateUpdate = getRateByteFromCompactData(compactData, token, false);
            extraBps = int(rateUpdate) * 10;
            rate = addBps(rate, extraBps);

            // compute token qty
            imbalanceQty = -1 * int(qty);
            totalImbalance += imbalanceQty;

            // add qty overhead
            extraBps = executeStepFunction(tokenData[token].sellRateQtyStepFunction, int(qty));
            rate = addBps(rate, extraBps);

            // add imbalance overhead
            extraBps = executeStepFunction(tokenData[token].sellRateImbalanceStepFunction, totalImbalance);
            rate = addBps(rate, extraBps);
        }

        if (abs(totalImbalance) >= getMaxTotalImbalance(token)) return 0;
        if (abs(blockImbalance + imbalanceQty) >= getMaxPerBlockImbalance(token)) return 0;

        return rate;
    }

    function getImbalancePerToken(IERC20Ext token, uint whichBlock)
        public view
        returns(int totalImbalance, int currentBlockImbalance)
    {
        uint rateUpdateBlock = getRateUpdateBlock(token);
        // if whichBlock = 0, use latest block, otherwise use whichBlock
        uint usedBlock = whichBlock == 0 ? block.number : whichBlock;
        return getImbalance(token, rateUpdateBlock, usedBlock);
    }

    function getRateUpdateBlock(IERC20Ext token) public view returns(uint) {
        bytes32 compactData = tokenRatesCompactData[tokenData[token].compactDataArrayIndex];
        return getLast4Bytes(compactData);
    }

    function getListedTokens() public view returns(IERC20Ext[] memory) {
        return listedTokens;
    }

    // Override function getImbalance to fix #240
    function getImbalance(IERC20Ext token, uint rateUpdateBlock, uint currentBlock)
        internal view override
        returns(int totalImbalance, int currentBlockImbalance)
    {
        int resolution = int(tokenControlInfo[token].minimalRecordResolution);

        (totalImbalance, currentBlockImbalance) =
            getImbalanceSinceRateUpdate(
                token,
                rateUpdateBlock,
                currentBlock);

        if (!checkMultOverflow(totalImbalance, resolution)) {
            totalImbalance *= resolution;
        } else {
            totalImbalance = MAX_IMBALANCE;
        }

        if (!checkMultOverflow(currentBlockImbalance, resolution)) {
            currentBlockImbalance *= resolution;
        } else {
            currentBlockImbalance = MAX_IMBALANCE;
        }
    }

    function executeStepFunction(StepFunction storage f, int x) internal pure returns(int) {
        uint len = f.y.length;
        for (uint ind = 0; ind < len; ind++) {
            if (x <= f.x[ind]) return f.y[ind];
        }

        return f.y[len-1];
    }

    function getTokenQty(IERC20Ext token, uint ethQty, uint rate) internal view returns(uint) {
        uint dstDecimals = getDecimals(token);
        uint srcDecimals = ETH_DECIMALS;

        return calcDstQty(ethQty, srcDecimals, dstDecimals, rate);
    }

    function getRateByteFromCompactData(
        bytes32 data,
        IERC20Ext token,
        bool buy
    ) internal view returns(int8) {
        uint fieldOffset = tokenData[token].compactDataFieldIndex;
        uint byteOffset;
        if (buy)
            byteOffset = 32 - NUM_TOKENS_IN_COMPACT_DATA + fieldOffset;
        else
            byteOffset = 4 + fieldOffset;

        return int8(data[byteOffset]);
    }

    function checkMultOverflow(int x, int y) internal pure returns(bool) {
        if (y == 0) return false;
        return (((x*y) / y) != x);
    }

    function getLast4Bytes(bytes32 b) internal pure returns(uint) {
        // cannot trust compiler with not turning bit operations into EXP opcode
        return uint(b) / (BYTES_14_OFFSET * BYTES_14_OFFSET);
    }

    function addBps(uint rate, int bps) internal pure returns(uint) {
        require(rate <= MAX_RATE, "rate > MAX_RATE");
        require(bps >= MIN_BPS_ADJUSTMENT, "rate < MIN_BPS");
        require(bps <= MAX_BPS_ADJUSTMENT, "rate > MAX_BPS");

        uint maxBps = 100 * 100;
        return (rate * uint(int(maxBps) + bps)) / maxBps;
    }

    function abs(int x) internal pure returns(uint) {
        if (x < 0)
            return uint(-1 * x);
        else
            return uint(x);
    }
}
