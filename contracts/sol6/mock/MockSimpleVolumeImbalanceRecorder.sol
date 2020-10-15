pragma solidity 0.6.6;

import "../fprConversionRates/SimpleVolumeImbalanceRecorder.sol";

contract MockSimpleVolumeImbalanceRecorder is SimpleVolumeImbalanceRecorder {
    constructor(address _admin) public SimpleVolumeImbalanceRecorder(_admin) {}

    function mockAddImbalance(
        IERC20Ext token,
        int256 buyAmount,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) external {
        addImbalance(token, buyAmount, rateUpdateBlock, currentBlock);
    }

    function mockGetImbalanceInResolution(
        IERC20Ext token,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) external view returns (int256 totalImbalance, int256 currentBlockImbalance) {
        return getImbalanceInResolution(token, rateUpdateBlock, currentBlock);
    }
}
