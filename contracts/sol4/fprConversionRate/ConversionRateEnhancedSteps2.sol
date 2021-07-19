pragma solidity 0.4.18;

import "./ConversionRateEnhancedSteps.sol";
import "../ERC20Interface.sol";

/* solhint-disable max-line-length */
contract ConversionRateEnhancedSteps2 is ConversionRateEnhancedSteps {
    uint256[] internal emptySlotIndicies;

    event AddToken(
        ERC20 indexed token,
        uint256 compactDataArrayIndex,
        uint256 compactDataFieldIndex
    );
    event RemoveToken(ERC20 indexed token, uint256 emptyIndexSlot);

    function ConversionRateEnhancedSteps2(address _admin)
        public
        ConversionRateEnhancedSteps(_admin)
    {}

    /// @dev add a token to reserve, if there is empty slots, fill it else create a new slot
    function addToken(ERC20 token) public onlyAdmin {
        require(!tokenData[token].listed);
        tokenData[token].listed = true;

        uint256 compactDataArrayIndex;
        uint256 compactDataFieldIndex;

        if (emptySlotIndicies.length != 0) {
            // pop the last empty slot
            uint256 slotIndex = emptySlotIndicies[emptySlotIndicies.length - 1];
            emptySlotIndicies.length--;

            compactDataArrayIndex = slotIndex / NUM_TOKENS_IN_COMPACT_DATA;
            compactDataFieldIndex = slotIndex % NUM_TOKENS_IN_COMPACT_DATA;
        } else {
            if (numTokensInCurrentCompactData == 0) {
                tokenRatesCompactData.length++; // add new structure
            }
            compactDataArrayIndex = tokenRatesCompactData.length - 1;
            compactDataFieldIndex = numTokensInCurrentCompactData;
            // prettier-ignore
            numTokensInCurrentCompactData = (numTokensInCurrentCompactData + 1) % NUM_TOKENS_IN_COMPACT_DATA;
        }
        tokenData[token].compactDataArrayIndex = compactDataArrayIndex;
        tokenData[token].compactDataFieldIndex = compactDataFieldIndex;

        listedTokens.push(token);

        setGarbageToVolumeRecorder(token);
        setDecimals(token);

        AddToken(token, compactDataArrayIndex, compactDataFieldIndex);
    }

    /// @dev remove a token from compact data
    function removeToken(ERC20 token) public onlyAdmin {
        require(tokenData[token].listed);
        TokenData storage data = tokenData[token];
        // prettier-ignore
        uint256 slotIndex = data.compactDataArrayIndex * NUM_TOKENS_IN_COMPACT_DATA + data.compactDataFieldIndex;
        emptySlotIndicies.push(slotIndex);
        // disable token and remove it from listedTokens
        data.listed = false;
        data.enabled = false;

        uint256 removeIndex = uint256(-1);
        for (uint256 i = 0; i < listedTokens.length; i++) {
            if (listedTokens[i] == token) {
                removeIndex = i;
            }
        }
        require(removeIndex != uint256(-1));
        listedTokens[removeIndex] = listedTokens[listedTokens.length - 1];
        listedTokens.length--;

        RemoveToken(token, slotIndex);
    }

    function getEmptySlotIndicies() public view returns (uint256[]) {
        return emptySlotIndicies;
    }
}
