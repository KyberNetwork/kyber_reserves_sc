pragma solidity 0.4.18;

import "./ConversionRateEnhancedSteps.sol";

/// @title ConversionRateEnhancedStepsWithCustomQuote contract
/// - new ConversionRates contract support custom quote contracts
/// Removed qty step function overhead
/// Also fixed following issues:
/// https://github.com/KyberNetwork/smart-contracts/issues/291
/// https://github.com/KyberNetwork/smart-contracts/issues/241
/// https://github.com/KyberNetwork/smart-contracts/issues/240

contract ConversionRateEnhancedStepsWithCustomQuote is
    ConversionRateEnhancedSteps
{
    ERC20 internal quoteToken;
    uint internal decimals;

    function ConversionRateEnhancedStepsWithCustomQuote(
        address _admin,
        ERC20 _quoteToken
    ) public ConversionRateEnhancedSteps(_admin) {
        quoteToken = _quoteToken;
        decimals = _quoteToken.decimals();
    }

    function addToken(ERC20 token) public onlyAdmin {
        require(token != quoteToken);
        require(!tokenData[token].listed);
        tokenData[token].listed = true;
        listedTokens.push(token);

        if (numTokensInCurrentCompactData == 0) {
            tokenRatesCompactData.length++; // add new structure
        }

        tokenData[token].compactDataArrayIndex =
            tokenRatesCompactData.length -
            1;
        tokenData[token].compactDataFieldIndex = numTokensInCurrentCompactData;

        numTokensInCurrentCompactData =
            (numTokensInCurrentCompactData + 1) %
            NUM_TOKENS_IN_COMPACT_DATA;

        setGarbageToVolumeRecorder(token);

        setDecimals(token);
    }

    function getTokenQty(
        ERC20 token,
        uint256 quoteQty,
        uint256 rate
    ) internal view returns (uint256) {
        uint256 dstDecimals = getDecimals(token);
        uint256 srcDecimals = decimals;

        return calcDstQty(quoteQty, srcDecimals, dstDecimals, rate);
    }
}
