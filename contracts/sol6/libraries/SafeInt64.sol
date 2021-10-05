pragma solidity 0.6.6;

/// @dev this is another verison of SignedSafeMath(OpenZeppelin) for int64
library SafeInt64 {
    function add(int64 a, int64 b) internal pure returns (int64) {
        int64 c = a + b;
        require((b >= 0 && c >= a) || (b < 0 && c < a), "SafeInt64: addition overflow");
        return c;
    }
}
