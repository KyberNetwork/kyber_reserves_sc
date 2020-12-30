pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/IERC20Ext.sol";
import "@kyber.network/utils-sc/contracts/Withdrawable.sol";

interface IConversionRatesGetSteps {
    function getStepFunctionData(IERC20Ext token, uint command, uint param)
        external view returns(int);
}

contract WrapReadTokenDataV2 is Withdrawable {
    constructor(address _admin) public Withdrawable(_admin) {}

    function readQtyStepFunctions(
        IConversionRatesGetSteps rate,
        IERC20Ext token
    )
        external view
        returns (
            int numBuyRateQtyStepsX, 
            int[] memory buyRateQtyStepsX,
            int numBuyRateQtyStepsY,
            int[] memory buyRateQtyStepsY,
            int numSellRateQtyStepsX,
            int[] memory sellRateQtyStepsX,
            int numSellRateQtyStepsY,
            int[] memory sellRateQtyStepsY
        )
    {
        uint i;
        numBuyRateQtyStepsX = rate.getStepFunctionData(token, 0, 0);
        buyRateQtyStepsX = new int[](uint(numBuyRateQtyStepsX));

        for (i = 0; i < uint(numBuyRateQtyStepsX); i++) {
            buyRateQtyStepsX[i] = rate.getStepFunctionData(token, 1, i);
        }

        numBuyRateQtyStepsY = rate.getStepFunctionData(token, 2, 0);
        buyRateQtyStepsY = new int[](uint(numBuyRateQtyStepsY));

        for (i = 0; i < uint(numBuyRateQtyStepsY); i++) {
            buyRateQtyStepsY[i] = rate.getStepFunctionData(token, 3, i);
        }

        numSellRateQtyStepsX = rate.getStepFunctionData(token, 4, 0);
        sellRateQtyStepsX = new int[](uint(numSellRateQtyStepsX));

        for (i = 0; i < uint(numSellRateQtyStepsX); i++) {
            sellRateQtyStepsX[i] = rate.getStepFunctionData(token, 5, i);
        }

        numSellRateQtyStepsY = rate.getStepFunctionData(token, 6, 0);
        sellRateQtyStepsY = new int[](uint(numSellRateQtyStepsY));

        for (i = 0; i < uint(numSellRateQtyStepsY); i++) {
            sellRateQtyStepsY[i] = rate.getStepFunctionData(token, 7, i);
        }
    }

    function readImbalanceStepFunctions(
        IConversionRatesGetSteps rate,
        IERC20Ext token
    )
        external view
        returns (
            int numBuyRateImbalanceStepsX,
            int[] memory buyRateImbalanceStepsX,
            int numBuyRateImbalanceStepsY,
            int[] memory buyRateImbalanceStepsY,
            int numSellRateImbalanceStepsX,
            int[] memory sellRateImbalanceStepsX,
            int numSellRateImbalanceStepsY,
            int[] memory sellRateImbalanceStepsY
        )
    {
        uint i;
        numBuyRateImbalanceStepsX = rate.getStepFunctionData(token, 8, 0);
        buyRateImbalanceStepsX = new int[](uint(numBuyRateImbalanceStepsX));

        for (i = 0; i < uint(numSellRateImbalanceStepsX); i++) {
            buyRateImbalanceStepsX[i] = rate.getStepFunctionData(token, 9, i);
        }

        numBuyRateImbalanceStepsY = rate.getStepFunctionData(token, 10, 0);
        buyRateImbalanceStepsY = new int[](uint(numBuyRateImbalanceStepsY));
        for (i = 0; i < uint(numBuyRateImbalanceStepsY); i++) {
            buyRateImbalanceStepsY[i] = rate.getStepFunctionData(token, 11, i);
        }

        numSellRateImbalanceStepsX = rate.getStepFunctionData(token, 12, 0);
        sellRateImbalanceStepsX = new int[](uint(numSellRateImbalanceStepsX));

        for (i = 0; i < uint(numSellRateImbalanceStepsX); i++) {
            sellRateImbalanceStepsX[i] = rate.getStepFunctionData(token, 13, i);
        }

        numSellRateImbalanceStepsY = rate.getStepFunctionData(token, 14, 0);
        sellRateImbalanceStepsY = new int[](uint(numSellRateImbalanceStepsY));

        for (i = 0; i < uint(numSellRateImbalanceStepsY); i++) {
            sellRateImbalanceStepsY[i] = rate.getStepFunctionData(token, 15, i);
        }
    }
}
