pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";


interface ICRMulQuotes {

    function recordImbalance(
        IERC20Ext token,
        int256 amount,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) external;

    function getRate(
        IERC20Ext src,
        IERC20Ext dest,
        uint256 currentBlockNumber,
        uint256 amount
    ) external view returns(uint256);
}
