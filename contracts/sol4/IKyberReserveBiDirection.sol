pragma solidity 0.4.18;


import "./ERC20Interface.sol";

/// @title Kyber Reserve contract
interface KyberReserveInterface {

    function trade(
        ERC20 srcToken,
        uint qty,
        bool isSrcQty,
        ERC20 destToken,
        address destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable;

    function getConversionRate(
        ERC20 src,
        ERC20 dest,
        uint qty,
        bool isSrcQty,
        uint blockNumber
    ) public view returns(uint);
}
