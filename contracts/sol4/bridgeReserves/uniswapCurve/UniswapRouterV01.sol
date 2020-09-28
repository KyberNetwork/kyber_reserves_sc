pragma solidity 0.4.18;


interface UniswapRouterV01 {

    function swapExactETHForTokens(
        uint amountOutMin,
        address[] memory path,
        address to,
        uint deadline
    )
        public
        payable
        returns (uint[] memory amounts);
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] memory path,
        address to,
        uint deadline
    )
        public
        returns (uint[] memory amounts);

    function factory() public pure returns (address);
    function WETH() public pure returns (address);
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        public pure returns (uint amountOut);
}
