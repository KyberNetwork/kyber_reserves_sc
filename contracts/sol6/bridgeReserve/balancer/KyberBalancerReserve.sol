pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "./IBalancerExchangeProxy.sol";
import "../../IKyberReserve.sol";
import "../../IERC20.sol";
import "../../utils/Withdrawable3.sol";
import "../../utils/Utils5.sol";
import "../../utils/zeppelin/SafeERC20.sol";


contract KyberBalancerReserve is IKyberReserve, Withdrawable3, Utils5 {
    using SafeERC20 for IERC20;

    address public kyberNetwork;

    bool public tradeEnabled = true;

    IBalancerExchangeProxy public exchangeProxy;
    address public immutable weth;

    // maximum number of pools to use per token
    // 0 if token is not listed
    mapping(IERC20 => uint256) public numberPools;

    event TradeExecute(
        address indexed sender,
        IERC20 indexed srcToken,
        uint256 srcAmount,
        IERC20 indexed destToken,
        uint256 destAmount,
        address destAddress
    );

    event TokenListed(IERC20 indexed token, uint256 numberPools);
    event TokenDelisted(IERC20 indexed token);
    event TradeEnabled(bool enable);
    event EtherReceival(address indexed sender, uint256 amount);
    event KyberNetworkSet(address kyberNetwork);
    event BalancerExchangeProxySet(IBalancerExchangeProxy newProxy);
    event NumberPoolsForTokensUpdated(IERC20[] tokens, uint256[] nPools);

    constructor(
        IBalancerExchangeProxy _exchangeProxy,
        address _weth,
        address _kyberNetwork,
        address _admin
    ) public Withdrawable3(_admin) {
        require(_exchangeProxy != IBalancerExchangeProxy(0), "exchangeProxy 0");
        require(_weth != address(0), "weth 0");
        require(_kyberNetwork != address(0), "kyberNetwork 0");

        exchangeProxy = _exchangeProxy;
        weth = _weth;
        kyberNetwork = _kyberNetwork;
    }

    receive() external payable {
        emit EtherReceival(msg.sender, msg.value);
    }

    /**
      conversionRate: expected conversion rate should be >= this value.
     */
    function trade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool /* validate */
    ) external override payable returns (bool) {
        require(tradeEnabled, "trade is disabled");
        require(msg.sender == kyberNetwork, "only kyberNetwork");

        require(conversionRate > 0, "conversionRate 0");
        uint256 expectedDestAmount = calcDestAmount(
            srcToken,
            destToken,
            srcAmount,
            conversionRate
        );

        uint256 value;
        uint256 nPools;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount, "msg.value != srcAmount");
            value = srcAmount;
            nPools = numberPools[destToken];
        } else {
            require(msg.value == 0, "msg.value is not 0");
            // collect src token
            srcToken.safeTransferFrom(msg.sender, address(this), srcAmount);
            value = 0;
            nPools = numberPools[srcToken];
        }
        require(nPools > 0, "token is not listed");

        // trust Balancer by using expectedDestAmount as the min amount out
        // and not check for balance after the trade
        exchangeProxy.smartSwapExactIn{value: value}(
            srcToken,
            destToken,
            srcAmount,
            expectedDestAmount,
            nPools
        );

        if (destToken == ETH_TOKEN_ADDRESS) {
            (bool success, ) = destAddress.call{value: expectedDestAmount}("");
            require(success, "transfer back eth to destAddress failed");
        } else {
            destToken.safeTransfer(destAddress, expectedDestAmount);
        }

        emit TradeExecute(
            msg.sender,
            srcToken,
            srcAmount,
            destToken,
            expectedDestAmount,
            destAddress
        );
        return true;
    }

    function setKyberNetwork(address _kyberNetwork) external onlyAdmin {
        require(_kyberNetwork != address(0));
        if (kyberNetwork != _kyberNetwork) {
            kyberNetwork = _kyberNetwork;
            emit KyberNetworkSet(kyberNetwork);
        }
    }

    function setBalancerExchangeProxy(
        IBalancerExchangeProxy _newExchangeProxy
    )
        external onlyAdmin
    {
        require(_newExchangeProxy != IBalancerExchangeProxy(0), "new proxy is 0");
        if (exchangeProxy != _newExchangeProxy) {
            exchangeProxy = _newExchangeProxy;
            emit BalancerExchangeProxySet(_newExchangeProxy);
        }
    }

    function listTokens(
        IERC20[] calldata tokens,
        uint256[] calldata nPools
    )
        external onlyOperator
    {
        require(tokens.length == nPools.length, "lengths must be the same");
        for(uint256 i = 0; i < tokens.length; i++) {
            listToken(tokens[i], nPools[i]);
        }
    }

    function delistTokens(IERC20[] calldata tokens) external onlyOperator {
        for(uint256 i = 0; i < tokens.length; i++) {
            delistToken(tokens[i]);
        }
    }

    function updateNumberPoolsForTokens(
        IERC20[] calldata tokens, 
        uint256[] calldata nPools
    )
        external onlyOperator
    {
        require(tokens.length == nPools.length, "lengths must be the same");
        for(uint256 i = 0; i < tokens.length; i++) {
            require(numberPools[tokens[i]] > 0, "token is not listed yet");
            require(nPools[i] > 0, "number pools must be positive");
            numberPools[tokens[i]] = nPools[i];
        }
        emit NumberPoolsForTokensUpdated(tokens, nPools);
    }

    function enableTrade() external onlyAdmin {
        tradeEnabled = true;
        emit TradeEnabled(true);
    }

    function disableTrade() external onlyAlerter {
        tradeEnabled = false;
        emit TradeEnabled(false);
    }

    /**
     *   @dev called by kybernetwork to get settlement rate
     */
    function getConversionRate(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 /* blockNumber */
    ) external override view returns (uint256 rate) {
        if (!tradeEnabled) return 0;
        if (srcQty == 0) return 0;

        uint256 destQty;
        if (src == ETH_TOKEN_ADDRESS) {
            uint256 nPools = numberPools[dest];
            require(nPools > 0, "token is not listed");
            (, destQty) = exchangeProxy.viewSplitExactIn(
                weth,
                address(dest),
                srcQty,
                nPools
            );
        } else {
            uint256 nPools = numberPools[src];
            require(nPools > 0, "token is not listed");
            (, destQty) = exchangeProxy.viewSplitExactIn(
                address(src),
                weth,
                srcQty,
                nPools
            );
        }
        return calcRateFromQty(
            srcQty,
            destQty,
            getDecimals(src),
            getDecimals(dest)
        );
    }

    function listToken(
        IERC20 token,
        uint256 nPools
    ) public onlyOperator {
        require(token != IERC20(0), "token 0");
        require(nPools > 0, "numberPools can not be 0");
        require(numberPools[token] == 0, "token has been listed");

        numberPools[token] = nPools;

        token.safeApprove(address(exchangeProxy), MAX_ALLOWANCE);

        setDecimals(token);

        emit TokenListed(token, nPools);
    }

    function delistToken(IERC20 token) public onlyOperator {
        require(numberPools[token] > 0, "token is not listed");
        delete numberPools[token];
        token.safeApprove(address(exchangeProxy), 0);
        emit TokenDelisted(token);
    }
}
