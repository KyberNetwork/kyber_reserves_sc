pragma solidity 0.6.6;

import "../IKyberReserve.sol";

interface IPricing {
    function getRate(IERC20Ext token, uint currentBlockNumber, bool buy, uint qty)
        external view returns(uint);
}

contract ReserveGasProfiler {
    function profilePricingRate(
        IPricing pricing,
        IERC20Ext token,
        bool buy,
        uint256 srcQty
    ) external view returns (uint256) {
        uint256 gasAmt = gasleft();
        pricing.getRate(token, block.number, buy, srcQty);
        return gasAmt - gasleft();
    }

    function profileReserveRate(
        IKyberReserve reserve,
        IERC20Ext src,
        IERC20Ext dest,
        uint256 srcQty
    ) external view returns (uint256) {
        uint256 gasAmt = gasleft();
        reserve.getConversionRate(src, dest, srcQty, block.number);
        return gasAmt - gasleft();
    }
}
