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
        (numBuyRateQtyStepsX, buyRateQtyStepsX) =
            _getStepFunctionData(rate, token, 0);
        (numBuyRateQtyStepsY, buyRateQtyStepsY) =
            _getStepFunctionData(rate, token, 2);
        (numSellRateQtyStepsX, sellRateQtyStepsX) =
            _getStepFunctionData(rate, token, 4);
        (numSellRateQtyStepsY, sellRateQtyStepsY) =
            _getStepFunctionData(rate, token, 6);
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
        (numBuyRateImbalanceStepsX, buyRateImbalanceStepsX) =
            _getStepFunctionData(rate, token, 8);
        (numBuyRateImbalanceStepsY, buyRateImbalanceStepsY) =
            _getStepFunctionData(rate, token, 10);
        (numSellRateImbalanceStepsX, sellRateImbalanceStepsX) =
            _getStepFunctionData(rate, token, 12);
        (numSellRateImbalanceStepsY, sellRateImbalanceStepsY) =
            _getStepFunctionData(rate, token, 14);
    }

    function _getStepFunctionData(
        IConversionRatesGetSteps rate,
        IERC20Ext token,
        uint command
    ) internal view
        returns(
            int numSteps,
            int[] memory stepValues
        )
    {
        numSteps = rate.getStepFunctionData(token, command, 0);
        stepValues = new int[](uint(numSteps));
        for(uint i = 0; i < uint(numSteps); i++) {
            stepValues[i] = rate.getStepFunctionData(token, command + 1, i);
        }
    }
}
