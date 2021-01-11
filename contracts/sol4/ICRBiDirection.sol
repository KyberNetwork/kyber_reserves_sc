pragma solidity 0.4.18;


import "./ERC20Interface.sol";


interface ICRBiDirection {
    function recordImbalance(
        ERC20 token,
        int buyAmount,
        uint rateUpdateBlock,
        uint currentBlock
    )
        public;

    function fetchRate(
        ERC20 token,
        uint currentBlockNumber,
        bool buy,
        uint qty,
        bool isSrcQty
    ) public view returns (uint);
}
