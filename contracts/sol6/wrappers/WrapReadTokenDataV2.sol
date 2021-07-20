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
            int[] memory buyRateQtyStepsX,
            int[] memory buyRateQtyStepsY,
            int[] memory sellRateQtyStepsX,
            int[] memory sellRateQtyStepsY
        )
    {
        buyRateQtyStepsX = _getStepFunctionData(rate, token, 0);
        buyRateQtyStepsY = _getStepFunctionData(rate, token, 2);
        sellRateQtyStepsX = _getStepFunctionData(rate, token, 4);
        sellRateQtyStepsY = _getStepFunctionData(rate, token, 6);
    }

    function readImbalanceStepFunctions(
        IConversionRatesGetSteps rate,
        IERC20Ext token
    )
        external view
        returns (
            int[] memory buyRateImbalanceStepsX,
            int[] memory buyRateImbalanceStepsY,
            int[] memory sellRateImbalanceStepsX,
            int[] memory sellRateImbalanceStepsY
        )
    {
        buyRateImbalanceStepsX = _getStepFunctionData(rate, token, 8);
        buyRateImbalanceStepsY = _getStepFunctionData(rate, token, 10);
        sellRateImbalanceStepsX = _getStepFunctionData(rate, token, 12);
        sellRateImbalanceStepsY = _getStepFunctionData(rate, token, 14);
    }

    function _getStepFunctionData(
        IConversionRatesGetSteps rate,
        IERC20Ext token,
        uint command
    )
        internal view returns(int[] memory stepValues)
    {
        uint numSteps = uint(rate.getStepFunctionData(token, command, 0));
        stepValues = new int[](numSteps);
        for(uint i = 0; i < numSteps; i++) {
            stepValues[i] = rate.getStepFunctionData(token, command + 1, i);
        }
    }
}
