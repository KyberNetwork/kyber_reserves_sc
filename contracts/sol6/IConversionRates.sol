pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";


interface IConversionRates {

    function recordImbalance(
        IERC20Ext token,
        int buyAmount,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    ) external;

    function getRate(
        IERC20Ext token,
        uint256 currentBlockNumber,
        bool buy,
        uint256 qty
    ) external view returns(uint256);
}
