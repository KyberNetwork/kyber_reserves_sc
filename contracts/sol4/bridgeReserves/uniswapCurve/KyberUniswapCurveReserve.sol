pragma solidity 0.4.18;

import "../../KyberReserveInterface.sol";
import "../../ERC20Interface.sol";
import "../../Withdrawable.sol";
import "../../Utils3.sol";
import "./UniswapRouterV01.sol";
import "./UniswapV2Factory.sol";
import "./CurveDefiInterface.sol";


/// Support trade eth - token by using both Uniswap and Curve
/// Works with 2 Curve pools USDT-USDC-DAI-sUSD and WBTC-renBTC
contract KyberUniswapCurveReserve is KyberReserveInterface, Withdrawable, Utils3 {

    uint256 internal constant DEADLINE = 2**255;
    uint256 internal constant MAX_ALLOWANCE = uint256(-1);

    address public kyberNetwork;
    bool public tradeEnabled = true;

    UniswapRouterV01 public uniswapRouter;
    UniswapV2Factory public uniswapFactory;
    address public weth;

    mapping(address => bool) public tokenListed;
    // trade eth - token via a bridge token
    // for example: usdc and dai are bridge tokens of usdt
    // when trade eth - usdt, can trade eth - usdc - usdt or eth - dai - usdt
    mapping(address => address[]) public bridgeTokens;
    // index of a token in Curve pool as Curve is working with index
    mapping(address => int128) public tokenIndex;
    mapping(address => address) public curveDefiAddress;
    mapping(address => address) public uniswapPair;

    event TradeExecute(
        address indexed sender,
        ERC20 indexed srcToken,
        uint256 srcAmount,
        ERC20 indexed destToken,
        uint256 destAmount,
        address destAddress
    );

    event TokenListed(
        ERC20 indexed token,
        CurveDefiInterface curve,
        int128 index,
        int128[] bridgeTokenIndices,
        address[] bridgeTokens
    );
    event TokenDelisted(ERC20 indexed token);

    event TradeEnabled(bool enable);

    event BridgeTokensSet(ERC20 indexed token, ERC20[] bridgeTokens);

    event ApprovedAllowances(address curve, ERC20[] tokens, bool isReset);

    event EtherReceival(address indexed sender, uint256 amount);

    event KyberNetworkSet(address kyberNetwork);

    function KyberUniswapCurveReserve(
        UniswapRouterV01 _uniswapRouter,
        address _kyberNetwork
    ) public Withdrawable() {
        require(_uniswapRouter != UniswapRouterV01(0));
        require(_kyberNetwork != address(0));

        uniswapRouter = _uniswapRouter;
        weth = _uniswapRouter.WETH();
        uniswapFactory = UniswapV2Factory(_uniswapRouter.factory());
        kyberNetwork = _kyberNetwork;
    }

    function() external payable {
        EtherReceival(msg.sender, msg.value);
    }

    function setKyberNetwork(address _kyberNetwork) external onlyAdmin {
        require(_kyberNetwork != address(0));
        if (kyberNetwork != _kyberNetwork) {
            kyberNetwork = _kyberNetwork;
            KyberNetworkSet(kyberNetwork);
        }
    }

    /// @dev list a token to reserve
    /// assume token will be in a Curve pool
    /// bridgeTokenIndices: indices of list tokens that can be trade in Curve with the `token`
    /// may need to call approveAllowances for these bridgeTokens
    function listToken(
        ERC20 token,
        CurveDefiInterface _curve,
        int128 _index,
        int128[] _bridgeTokenIndices // index of bridge tokens in Curve pool
    )
        external onlyOperator
    {
        require(token != ERC20(0));
        require(!tokenListed[token]);
        tokenListed[token] = true;

        token.approve(uniswapRouter, MAX_ALLOWANCE);
        uniswapPair[token] = uniswapFactory.getPair(weth, address(token));

        address[] memory curveTokens = new address[](_bridgeTokenIndices.length);
        if (_curve != CurveDefiInterface(0)) {
            require(_curve.coins(_index) == address(token));
            curveDefiAddress[token] = _curve;
            if (token.allowance(address(this), _curve) == 0) {
                token.approve(_curve, MAX_ALLOWANCE);
            }
            tokenIndex[token] = _index;
            // no more than 3 bridge tokens
            require(_bridgeTokenIndices.length <= 3);
            for(uint256 i = 0; i < _bridgeTokenIndices.length; i++) {
                address curveCoin = _curve.coins(_bridgeTokenIndices[i]);
                require(curveCoin != address(0));
                curveDefiAddress[curveCoin] = _curve;
                tokenIndex[curveCoin] = _bridgeTokenIndices[i];
                curveTokens[i] = curveCoin;
            }
            bridgeTokens[token] = curveTokens;
        }

        setDecimals(token);

        TokenListed(token, _curve, _index, _bridgeTokenIndices, curveTokens);
    }

    function delistToken(ERC20 token) external onlyOperator {
        require(tokenListed[token]);
        delete tokenListed[token];
        delete tokenIndex[token];
        delete bridgeTokens[token];

        token.approve(uniswapRouter, 0);
        delete uniswapPair[token];

        address curveAddress = curveDefiAddress[token];
        if (curveAddress != address(0)) {
            token.approve(curveAddress, 0);
            delete curveDefiAddress[token];
        }

        TokenDelisted(token);
    }

    // in some cases we need to approve allowances for bridge tokens
    function approveAllowances(
        address spender,
        ERC20[] tokens,
        bool isReset
    )
        external onlyAdmin
    {
        uint256 allowance = isReset ? 0 : MAX_ALLOWANCE;
        for(uint256 i = 0; i < tokens.length; i++) {
            tokens[i].approve(spender, allowance);
        }
        ApprovedAllowances(spender, tokens, isReset);
    }

    function enableTrade() external onlyAdmin {
        tradeEnabled = true;
        TradeEnabled(true);
    }

    function disableTrade() external onlyAlerter {
        tradeEnabled = false;
        TradeEnabled(false);
    }

    /**
      conversionRate: expected conversion rate should be >= this value.
     */
    function trade(
        ERC20 srcToken,
        uint256 srcAmount,
        ERC20 destToken,
        address destAddress,
        uint256 conversionRate,
        bool /* validate */
    ) public payable returns (bool) {
        require(tradeEnabled);
        require(msg.sender == kyberNetwork);
        require(isValidTokens(srcToken, destToken));

        require(conversionRate > 0);

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
        } else {
            require(msg.value == 0);
        }

        uint256 expectedDestAmount = calcDestAmount(
            srcToken,
            destToken,
            srcAmount,
            conversionRate
        );

        ERC20 bridgeToken;
        bool useCurve;
        uint256 destAmount;
        uint256 uniswapDestAmount;

        if (srcToken == ETH_TOKEN_ADDRESS) {
            // recalculate path for eth -> token trade
            (, bridgeToken, useCurve, destAmount, uniswapDestAmount) =
                getTradeInformation(srcToken, destToken, srcAmount);
            destAmount = doTradeEthToToken(
                destToken,
                bridgeToken,
                useCurve,
                srcAmount,
                uniswapDestAmount
            );
            require(destAmount >= expectedDestAmount);
            destToken.transfer(destAddress, expectedDestAmount);
        } else {
            // use hint in conversionRate
            uint256 bridgeTokenHint = conversionRate % 4;
            useCurve = bridgeTokenHint > 0;
            if (useCurve) {
                bridgeToken = ERC20(bridgeTokens[srcToken][bridgeTokenHint - 1]);
            }

            // collect src amount
            srcToken.transferFrom(msg.sender, address(this), srcAmount);
            if (useCurve) {
                bridgeToken = ERC20(bridgeTokens[srcToken][bridgeTokenHint - 1]);
            }
            destAmount = doTradeTokenToEth(
                srcToken,
                bridgeToken,
                useCurve,
                srcAmount
            );
            require(destAmount >= expectedDestAmount);
            destAddress.transfer(expectedDestAmount);
        }

        TradeExecute(
            msg.sender,
            srcToken,
            srcAmount,
            destToken,
            expectedDestAmount,
            destAddress
        );
        return true;
    }

    /**
     *   @dev called by kybernetwork to get settlement rate
     */
    function getConversionRate(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty,
        uint256 /* blockNumber */
    ) public view returns (uint256 rate) {
        if (!isValidTokens(src, dest)) return 0;
        if (!tradeEnabled) return 0;
        if (srcQty == 0) return 0;

        uint256 destAmount;
        uint256 bridgeTokenPosition;
        bool useCurve;
        (bridgeTokenPosition, , useCurve, destAmount, ) =
            getTradeInformation(src, dest, srcQty);
        if (destAmount == 0) return 0;
        rate = calcRateFromQty(
            srcQty,
            destAmount,
            getDecimals(src),
            getDecimals(dest)
        );
        if (dest == ETH_TOKEN_ADDRESS) {
            // apply hint only for token -> eth trade
            rate = applyRateWithHint(rate, bridgeTokenPosition, useCurve);
        }
    }

    /// @dev get trade information, whether to use Curve or not
    /// If use Curve, bridgeToken: token to use with Curve
    /// bridgePosition: index of bridgeToken to use in bridgeTokens array
    /// only use uniswapDestAmount in eth -> token trade
    function getTradeInformation(ERC20 src, ERC20 dest, uint256 srcQty)
        public view
        returns(
            uint256 bridgePosition,
            ERC20 bridgeToken,
            bool useCurve,
            uint256 destAmount,
            uint256 uniswapDestAmount
        )
    {
        address[] memory tokens;
        ERC20 token;
        uint256 i;
        uint256 destQtyBridgeToken;

        if (src == ETH_TOKEN_ADDRESS) {
            // check eth -> token in Uniwap, token -> dest in Curve
            // first, not use Curve, get amount eth-> dest in Uniswap
            uniswapDestAmount = getUniswapDestAmount(dest, srcQty, true);
            destAmount = uniswapDestAmount;
            useCurve = false;
            tokens = bridgeTokens[dest];

            uint256 destQtyUniswap;
            for(i = 0; i < tokens.length; i++) {
                token = ERC20(tokens[i]);
                // swap eth -> token in Uniswap, token -> dest in Curve
                destQtyUniswap = getUniswapDestAmount(token, srcQty, true);
                if (destQtyUniswap > 0) {
                    destQtyBridgeToken = getCurveDestAmount(token, dest, destQtyUniswap);
                    if (destQtyBridgeToken > destAmount) {
                        destAmount = destQtyBridgeToken;
                        uniswapDestAmount = destQtyUniswap;
                        bridgePosition = i;
                        bridgeToken = token;
                        useCurve = true;
                    }
                }
            }
        } else {
            // check src -> token in Curve, token -> eth in Uniswap
            // first try to not use Curve
            destAmount = getUniswapDestAmount(src, srcQty, false);
            useCurve = false;
            tokens = bridgeTokens[src];
            for(i = 0; i < tokens.length; i++) {
                token = ERC20(tokens[i]);
                // swap src -> token in Curve, token -> eth in Uniswap
                destQtyBridgeToken = getCurveDestAmount(src, token, srcQty);
                if (destQtyBridgeToken > 0) {
                    destQtyBridgeToken = getUniswapDestAmount(token, destQtyBridgeToken, false);
                    if (destQtyBridgeToken > destAmount) {
                        destAmount = destQtyBridgeToken;
                        bridgePosition = i;
                        bridgeToken = token;
                        useCurve = true;
                    }
                }
            }
        }
    }

    function doTradeEthToToken(
        ERC20 token,
        ERC20 bridgeToken,
        bool useCurve,
        uint256 srcAmount,
        uint256 uniswapDestAmount
    )
        internal returns(uint destAmount)
    {
        address[] memory path = new address[](2);
        path[0] = weth;
        if (!useCurve) {
            // directly swap with Uniswap
            path[1] = address(token);
            uniswapRouter.swapExactETHForTokens.value(srcAmount)(
                0, path, address(this), DEADLINE
            );
            destAmount = uniswapDestAmount;
        } else {
            uint256 balanceBefore = token.balanceOf(address(this));
            // swap eth -> bridge token on Uniswap
            path[1] = address(bridgeToken);
            uniswapRouter.swapExactETHForTokens.value(srcAmount)(
                0, path, address(this), DEADLINE
            );
            // swap bridge token -> dest on Curve
            CurveDefiInterface(curveDefiAddress[bridgeToken]).exchange(
                tokenIndex[bridgeToken],
                tokenIndex[token],
                uniswapDestAmount,
                0
            );
            uint256 balanceAfter = token.balanceOf(address(this));
            require(balanceAfter >= balanceBefore);
            destAmount = balanceAfter - balanceBefore;
        }
    }

    function doTradeTokenToEth(
        ERC20 token,
        ERC20 bridgeToken,
        bool useCurve,
        uint256 srcAmount
    )
        internal returns(uint destAmount)
    {
        uint256 balanceBefore = address(this).balance;
        address[] memory path = new address[](2);
        path[1] = weth;
        if (!useCurve) {
            // directly swap with Uniswap
            path[0] = address(token);
            uniswapRouter.swapExactTokensForETH(
                srcAmount, 0, path, address(this), DEADLINE
            );
        } else {
            // swap from src -> bridge token on Curve
            uint256 bridgeTokenBalBefore = bridgeToken.balanceOf(address(this));
            CurveDefiInterface(curveDefiAddress[bridgeToken]).exchange(
                tokenIndex[token],
                tokenIndex[bridgeToken],
                srcAmount,
                0
            );
            uint256 bridgeTokenBalAfter = bridgeToken.balanceOf(address(this));
            require(bridgeTokenBalAfter >= bridgeTokenBalBefore);
            // swap from bridge token -> eth on Uniswap
            path[0] = address(bridgeToken);
            uniswapRouter.swapExactTokensForETH(
                bridgeTokenBalAfter - bridgeTokenBalBefore, 0, path, address(this), DEADLINE
            );
        }
        uint256 balanceAfter = address(this).balance;
        require(balanceAfter >= balanceBefore);
        destAmount = balanceAfter - balanceBefore;
    }

    function getUniswapDestAmount(
        ERC20 token,
        uint256 srcQty,
        bool ethToToken
    ) internal view returns (uint256 destAmount) {
        address pair = uniswapPair[token];
        if (pair == address(0)) { return 0; }
        uint256 wethBalance = ERC20(weth).balanceOf(pair);
        uint256 tokenBalance = token.balanceOf(pair);
        if (ethToToken) {
            destAmount = uniswapRouter.getAmountOut(srcQty, wethBalance, tokenBalance);
        } else {
            destAmount = uniswapRouter.getAmountOut(srcQty, tokenBalance, wethBalance);
        }
    }

    function getCurveDestAmount(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty
    ) internal view returns (uint256 destAmount) {
        CurveDefiInterface curve = CurveDefiInterface(curveDefiAddress[src]);
        if (curve != curveDefiAddress[dest]) return 0;
        destAmount = curve.get_dy(tokenIndex[src], tokenIndex[dest], srcQty);
    }

    function isValidTokens(ERC20 src, ERC20 dest) internal view returns (bool) {
        return ((src == ETH_TOKEN_ADDRESS && tokenListed[dest]) ||
            (tokenListed[src] && dest == ETH_TOKEN_ADDRESS));
    }

    /// @dev Apply rate with a trade hint, to save gas when calling trade function
    ///      if not using Curve, rate % 4 = 0
    ///      if using Curve, (rate % 4) - 1 is the index of bridgeToken to use
    function applyRateWithHint(
        uint256 rate,
        uint256 position,
        bool useCurve
    )
        internal pure returns(uint256 newRate)
    {
        if (rate <= 8) return rate; // prevent underflow below
        newRate = rate - (rate % 4) - 4;
        if (useCurve) {
            newRate += (position + 1);
        }
    }
}
