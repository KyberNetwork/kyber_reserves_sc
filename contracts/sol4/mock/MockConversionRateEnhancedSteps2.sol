pragma solidity ^0.4.18;

import "../fprConversionRate/ConversionRateEnhancedSteps2.sol";

contract MockConversionRateEnhancedSteps2 is ConversionRateEnhancedSteps2 {
    function MockConversionRateEnhancedSteps2(address admin)
        public
        ConversionRateEnhancedSteps2(admin)
    {}

    function getInitImbalance(ERC20 token)
        public
        view
        returns (int256 totalImbalance)
    {
        // check if trade is enabled
        if (!tokenData[token].enabled) return 0;
        // token control info not set
        if (tokenControlInfo[token].minimalRecordResolution == 0) return 0;

        // get rate update block
        bytes32 compactData =
            tokenRatesCompactData[tokenData[token].compactDataArrayIndex];

        uint256 updateRateBlock = getLast4Bytes(compactData);
        // check imbalance
        (totalImbalance, ) = getImbalance(token, updateRateBlock, block.number);
    }

    function mockGetMaxTotalImbalance(ERC20 token)
        public
        view
        returns (uint256)
    {
        return getMaxTotalImbalance(token);
    }

    function getUpdateRateBlockFromCompact(ERC20 token)
        public
        view
        returns (uint256 updateRateBlock)
    {
        // get rate update block
        bytes32 compactData =
            tokenRatesCompactData[tokenData[token].compactDataArrayIndex];
        updateRateBlock = getLast4Bytes(compactData);
    }

    function mockExecuteStepFunction(
        ERC20 token,
        int256 from,
        int256 to
    ) public view returns (int256) {
        return
            executeStepFunction(
                tokenData[token].buyRateImbalanceStepFunction,
                from,
                to
            );
    }

    function mockGetImbalanceMax() public pure returns (int256) {
        return MAX_IMBALANCE;
    }

    function mockEncodeStepData(int128 x, int128 y)
        public
        pure
        returns (int256)
    {
        return encodeStepFunctionData(x, y);
    }

    function mockDecodeStepData(int256 val)
        public
        pure
        returns (int256, int256)
    {
        return decodeStepFunctionData(val);
    }

    function mockCheckValueMaxImbalance(uint256 maxVal)
        public
        pure
        returns (bool)
    {
        return int256(maxVal) == MAX_IMBALANCE;
    }

    function mockAddBps(uint256 rate, int256 bps)
        public
        pure
        returns (uint256)
    {
        return addBps(rate, bps);
    }

    function mockCheckMultiOverflow(int256 x, int256 y)
        public
        pure
        returns (bool)
    {
        return checkMultOverflow(x, y);
    }
}
