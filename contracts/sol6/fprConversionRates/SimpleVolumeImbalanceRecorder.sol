pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/Utils.sol";
import "@kyber.network/utils-sc/contracts/Withdrawable.sol";

/// @dev this is another verison of SignedSafeMath(OpenZeppelin) for int64
library SafeInt64 {
    function add(int64 a, int64 b) internal pure returns (int64) {
        int64 c = a + b;
        require((b >= 0 && c >= a) || (b < 0 && c < a), "SafeInt64: addition overflow");
        return c;
    }
}

contract SimpleVolumeImbalanceRecorder is Withdrawable {
    using SafeInt64 for int64;

    int256 internal constant MAX_INT64 = 2**63 - 1;
    int256 internal constant MIN_INT64 = -(2**63);
    /// @dev data can be compressed into 1 word in storage
    struct TokenControlInfo {
        uint128 minimalRecordResolution; // should be roughly 1 cent
        uint64 maxPerBlockImbalanceInResolution; // in resolution
        uint64 maxTotalImbalanceInResolution; // in resolution
    }

    /// @dev data can be compressed into 1 word in storage
    struct TokenImbalanceData {
        int64 lastBlockBuyUnitsImbalance;
        uint64 lastBlock;
        int64 totalBuyUnitsImbalance;
        uint64 lastRateUpdateBlock;
    }

    mapping(IERC20Ext => TokenControlInfo) internal tokenControlInfo;
    mapping(IERC20Ext => TokenImbalanceData) public tokenImbalanceData;

    constructor(address _admin) public Withdrawable(_admin) {}

    function setTokenControlInfo(
        IERC20Ext token,
        uint128 minimalRecordResolution,
        uint256 maxPerBlockImbalance,
        uint256 maxTotalImbalance
    ) external onlyAdmin {
        require(minimalRecordResolution != 0, "zero minimalRecordResolution");
        require(maxPerBlockImbalance != 0, "zero maxPerBlockImbalance");
        require(maxTotalImbalance != 0, "zero maxTotalImbalance");

        uint256 maxPerBlockImbalanceInResolution = maxPerBlockImbalance /
            uint256(minimalRecordResolution);
        // because abs(lastBlockBuyUnitsImbalance) <= MAX_INT64
        // maxPerBlockImbalanceInResolution <= MAX_INT64
        require(
            maxPerBlockImbalanceInResolution <= uint256(MAX_INT64),
            "overflow maxPerBlockImbalance"
        );
        uint256 maxTotalImbalanceInResolution = maxTotalImbalance /
            uint256(minimalRecordResolution);
        // because abs(totalBuyUnitsImbalance) <= MAX_INT64
        // maxTotalImbalanceInResolution <= MAX_INT64
        require(maxTotalImbalanceInResolution <= uint256(MAX_INT64), "overflow maxTotalImbalance");
        tokenControlInfo[token] = TokenControlInfo(
            uint128(minimalRecordResolution),
            uint64(maxPerBlockImbalanceInResolution),
            uint64(maxTotalImbalanceInResolution)
        );
    }

    function getTokenControlInfo(IERC20Ext token)
        external
        view
        returns (
            uint256 minimalRecordResolution,
            uint256 maxPerBlockImbalanceInResolution,
            uint256 maxTotalImbalanceInResolution
        )
    {
        minimalRecordResolution = tokenControlInfo[token].minimalRecordResolution;
        maxPerBlockImbalanceInResolution = tokenControlInfo[token]
            .maxPerBlockImbalanceInResolution;
        maxTotalImbalanceInResolution = tokenControlInfo[token].maxTotalImbalanceInResolution;
    }

    function addImbalance(
        IERC20Ext token,
        int256 buyAmount,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) internal {
        int64 recordedBuyAmount = safeInt64(
            buyAmount / int256(tokenControlInfo[token].minimalRecordResolution)
        );
        TokenImbalanceData memory currentBlockData = tokenImbalanceData[token];

        // first scenario - this is not the first tx in the current block
        if (currentBlockData.lastBlock == currentBlock) {
            currentBlockData.lastBlockBuyUnitsImbalance = currentBlockData
                .lastBlockBuyUnitsImbalance
                .add(recordedBuyAmount);
        } else {
            currentBlockData.lastBlock = uint64(currentBlock);
            currentBlockData.lastBlockBuyUnitsImbalance = recordedBuyAmount;
        }

        if (uint256(currentBlockData.lastRateUpdateBlock) == rateUpdateBlock) {
            currentBlockData.totalBuyUnitsImbalance = currentBlockData.totalBuyUnitsImbalance.add(
                recordedBuyAmount
            );
        } else {
            currentBlockData.lastRateUpdateBlock = uint64(rateUpdateBlock);
            // because we don't keep track of imbalance from rateUpdateBlock to currentBlock
            // we need to reset totalImbalance to the blockImbalance
            // this will also cover the case when rateUpdating transaction is in middle of block
            currentBlockData.totalBuyUnitsImbalance = currentBlockData.lastBlockBuyUnitsImbalance;
        }
        tokenImbalanceData[token] = currentBlockData;
    }

    function setGarbageToVolumeRecorder(IERC20Ext token) internal {
        TokenImbalanceData memory currentBlockData;
        currentBlockData.lastBlock = 1;
        tokenImbalanceData[token] = currentBlockData;
    }

    function getImbalanceInResolution(
        IERC20Ext token,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) internal view returns (int256 totalImbalance, int256 currentBlockImbalance) {
        TokenImbalanceData memory currentBlockData = tokenImbalanceData[token];

        if (uint256(currentBlockData.lastRateUpdateBlock) == rateUpdateBlock) {
            totalImbalance = currentBlockData.totalBuyUnitsImbalance;
        } else {
            totalImbalance = 0;
        }

        if (uint256(currentBlockData.lastBlock) == currentBlock) {
            currentBlockImbalance = currentBlockData.lastBlockBuyUnitsImbalance;
        } else {
            currentBlockImbalance = 0;
        }
    }

    function safeInt64(int256 a) internal pure returns (int64) {
        require((a <= MAX_INT64) && (a >= MIN_INT64), "SafeInt64: type cast overflow");
        return int64(a);
    }
}
