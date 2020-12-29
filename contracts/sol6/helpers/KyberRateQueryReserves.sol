pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/Utils.sol";
import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";
import "../IConversionRates.sol";
import "../IKyberSanity.sol";
import "../IKyberReserve.sol";

interface IKyberReserveExt is IKyberReserve {
    function conversionRatesContract() external view returns (IConversionRates);
    function sanityRatesContract() external view returns (IKyberSanity);
}

contract KyberRateQueryReserves is Utils {

    function getRatesWithEth(
        IKyberReserveExt reserve,
        IERC20Ext[] calldata tokens,
        uint256 weiAmount
    )
        external view returns(uint256[] memory sellRates, uint256[] memory buyRates)
    {
        uint256 numTokens = tokens.length;

        buyRates = new uint256[](numTokens);
        sellRates = new uint256[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            (buyRates[i], sellRates[i], , , ) = getRateWithEth(reserve, tokens[i], weiAmount);
        }
    }

    function getRatesWithToken(
        IKyberReserveExt reserve,
        IERC20Ext[] calldata tokens,
        uint256 tweiAmount
    )
        external view 
        returns(uint256[] memory sellRates, uint256[] memory buyRates)
    {
        uint256 numTokens = tokens.length;

        buyRates = new uint256[](numTokens);
        sellRates = new uint256[](numTokens);
        for (uint256 i = 0; i < numTokens; i++) {
            (buyRates[i], sellRates[i], ,  , ) = getRateWithToken(reserve, tokens[i], tweiAmount);
        }
    }

    function getReserveRates(
        IKyberReserveExt reserve,
        IERC20Ext[] calldata srcs,
        IERC20Ext[] calldata dests
    )
        external view returns(uint256[] memory pricingRates, uint256[] memory sanityRates)
    {
        require(srcs.length == dests.length, "srcs length != dests");

        pricingRates = new uint256[](srcs.length);
        sanityRates = new uint256[](srcs.length);
        IKyberSanity sanityRateContract;
        IConversionRates conversionRateContract;

        try reserve.sanityRatesContract() returns (IKyberSanity sanityContract) {
            sanityRateContract = sanityContract;
        } catch {}

        try reserve.conversionRatesContract() returns (IConversionRates ratesContract) {
            conversionRateContract = ratesContract;
        } catch {
            revert("no conversionRate contract");
        }

        for (uint256 i = 0 ; i < srcs.length ; i++) {

            if (sanityRateContract != IKyberSanity(0x0)) {
                sanityRates[i] = sanityRateContract.getSanityRate(srcs[i], dests[i]);
            }

            pricingRates[i] = conversionRateContract.getRate(
                srcs[i] == ETH_TOKEN_ADDRESS ? dests[i] : srcs[i],
                block.number,
                srcs[i] == ETH_TOKEN_ADDRESS ? true : false,
                0);
        }
    }

    function getRateWithEth(IKyberReserveExt reserve, IERC20Ext token, uint256 weiAmount)
        public view 
        returns(
            uint256 reserveSellRate,
            uint256 reserveBuyRate,
            uint256 pricingSellRate,
            uint256 pricingBuyRate,
            uint256 tweiAmount
        )
    {
        IConversionRates conversionRate = reserve.conversionRatesContract();

        reserveBuyRate = IKyberReserveExt(reserve).getConversionRate(
                    ETH_TOKEN_ADDRESS,
                    token,
                    weiAmount,
                    block.number
                );

        pricingBuyRate = conversionRate.getRate(token, block.number, true, weiAmount);

        tweiAmount = calcDestAmount(
            ETH_TOKEN_ADDRESS, 
            token, 
            weiAmount, 
            reserveBuyRate == 0 ? pricingBuyRate : reserveBuyRate);

        reserveSellRate = reserve.getConversionRate(
                    token,
                    ETH_TOKEN_ADDRESS,
                    tweiAmount,
                    block.number
                );
                
        pricingSellRate = conversionRate.getRate(token, block.number, false, tweiAmount);
    }

    function getRateWithToken(IKyberReserveExt reserve, IERC20Ext token, uint256 tweiAmount)
        public view 
        returns(
            uint256 reserveBuyRate, 
            uint256 reserveSellRate, 
            uint256 pricingBuyRate,
            uint256 pricingSellRate,
            uint256 weiAmount
        ) 
    {
        IConversionRates conversionRate = reserve.conversionRatesContract();

        reserveSellRate = IKyberReserveExt(reserve).getConversionRate(
                token,
                ETH_TOKEN_ADDRESS,
                tweiAmount,
                block.number
            );

        pricingSellRate = conversionRate.getRate(token, block.number, false, tweiAmount);

        weiAmount = calcDestAmount(
                token, 
                ETH_TOKEN_ADDRESS, 
                tweiAmount,
                reserveSellRate == 0 ? pricingSellRate : reserveSellRate
            );

        reserveBuyRate = IKyberReserveExt(reserve).getConversionRate(
                ETH_TOKEN_ADDRESS,
                token,
                weiAmount,
                block.number
            );

        pricingBuyRate = conversionRate.getRate(token, block.number, true, weiAmount);
    }
}
