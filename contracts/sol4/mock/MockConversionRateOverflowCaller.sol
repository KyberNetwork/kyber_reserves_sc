pragma solidity 0.4.18;

interface IConversionRatesEncodeData {
    function mockEncodeStepData(int128 x, int128 y) public pure returns (int);
}

contract MockConversionRateOverflowCaller {
    function callEncodeDataOverflow(IConversionRatesEncodeData _cr, bool isX, bool positive)
        public pure returns (int)
    {
        int128 amt = positive ? int128(2**127) : int128(-1 * 2 ** 127 - 1);
        return isX ? _cr.mockEncodeStepData(amt, 0) : _cr.mockEncodeStepData(0, amt);
    }
}
