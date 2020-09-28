pragma solidity 0.4.18;


interface CurveDefiInterface {
    function get_dy(int128 i, int128 j, uint dx) external view returns(uint dy);
    function coins(int128 i) external view returns(address);
    function exchange(int128 i, int128 j, uint dx, uint256 minDy) external returns(uint dy);
}
