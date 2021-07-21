pragma solidity 0.4.18;

import "./WrapConversionRatesEnhancedSteps.sol";
import "../fprConversionRate/ConversionRateEnhancedSteps2.sol";

///  @dev extended version with "removeToken" function
contract WrapConversionRateEnhancedSteps2 is WrapConversionRateEnhancedSteps {
    //constructor
    function WrapConversionRateEnhancedSteps2(ConversionRates _conversionRates)
        public
        WrapConversionRateEnhancedSteps(_conversionRates)
    {
        /* empty block */
    }

    function removeToken(ERC20 token) public onlyAdmin {
        ConversionRateEnhancedSteps2(address(conversionRates)).removeToken(
            token
        );
    }
}
