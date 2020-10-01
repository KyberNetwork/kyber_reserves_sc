pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "../../IERC20.sol";


interface IBalancerExchangeProxy {
    struct Swap {
        address pool;
        address tokenIn;
        address tokenOut;
        uint    swapAmount; // tokenInAmount / tokenOutAmount
        uint    limitReturnAmount; // minAmountOut / maxAmountIn
        uint    maxPrice;
    }

    function smartSwapExactIn(
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint totalAmountIn,
        uint minTotalAmountOut,
        uint nPools
    )
        external payable
        returns (uint totalAmountOut);

    function viewSplitExactIn(
        address tokenIn,
        address tokenOut,
        uint swapAmount,
        uint nPools
    )
        external view
        returns (Swap[] memory swaps, uint totalOutput);
    
}
