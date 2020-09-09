pragma solidity 0.6.6;

import "../IKyberReserve.sol";

interface IPricing {
    function getRate(IERC20 token, uint currentBlockNumber, bool buy, uint qty) external view returns(uint);
}

contract ReserveGasProfiler {
    function profilePricingRate(
        IPricing pricing,
        IERC20 token,
        bool buy,
        uint256 srcQty
    ) external view returns (uint256) {
        return pricing.getRate(token, block.number, buy, srcQty);
    }

    function profileReserveRate(
        IKyberReserve reserve,
        IERC20 src,
        IERC20 dest,
        uint256 srcQty
    ) external view returns (uint256) {
        return reserve.getConversionRate(src, dest, srcQty, block.number);
    }
}
