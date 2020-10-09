pragma solidity 0.6.6;

import "../IKyberSanity.sol";


contract MockSanityRates is IKyberSanity {
    uint256 public sanityRateValue;

    function setSanityRateValue(uint256 _value) external {
        sanityRateValue = _value;
    }

    function getSanityRate(IERC20Ext src, IERC20Ext dest)
        external override view returns (uint256 rate)
    {
        src;
        dest;
        rate = sanityRateValue;
    }
}
