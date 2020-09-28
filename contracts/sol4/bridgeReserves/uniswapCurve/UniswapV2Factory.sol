pragma solidity 0.4.18;


interface UniswapV2Factory {
    function getPair(address tokenA, address tokenB) public view returns (address pair);
}
