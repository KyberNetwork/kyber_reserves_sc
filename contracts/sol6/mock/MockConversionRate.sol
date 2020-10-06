pragma solidity 0.6.6;

import "../fprConversionRates/QtyStepConversionRates.sol";

contract MockQtyStepConversionRates is QtyStepConversionRates {
    constructor(address admin) public QtyStepConversionRates(admin) {}

    function mockGetImbalance(
        IERC20Ext token,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) public view returns (int256 totalImbalance, int256 currentBlockImbalance) {
        (totalImbalance, currentBlockImbalance) = getImbalanceInResolution(
            token,
            rateUpdateBlock,
            currentBlock
        );
    }

    function getUpdateRateBlockFromCompact(IERC20Ext token)
        public
        view
        returns (uint256 updateRateBlock)
    {
        TokenData memory data = tokenData[token];
        TokenRatesCompactData memory compactData = tokenRatesCompactData[data
            .compactDataArrayIndex];
        updateRateBlock = compactData.blockNumber;
    }

    function mockAddBps(uint256 rate, int256 bps) public pure returns (uint256) {
        return addBps(rate, bps);
    }

    function mockIsTokenTradeEnabled(IERC20Ext token) public view returns (bool) {
        return tokenData[token].enabled;
    }
}
