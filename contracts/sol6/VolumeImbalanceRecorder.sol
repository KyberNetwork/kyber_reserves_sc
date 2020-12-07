pragma solidity 0.6.6;

import "@kyber.network/utils-sc/contracts/Utils.sol";
import "@kyber.network/utils-sc/contracts/Withdrawable.sol";


contract VolumeImbalanceRecorder is Utils, Withdrawable {

    uint128 constant internal SLIDING_WINDOW_SIZE = 5;
    uint128 constant internal POW_2_64 = 2 ** 64;

    struct TokenControlInfo {
        uint256 minimalRecordResolution; // can be roughly 1 cent
        uint256 maxPerBlockImbalance; // in twei resolution
        uint256 maxTotalImbalance; // max total imbalance (between rate updates)
                            // before halting trade
    }

    mapping(IERC20Ext => TokenControlInfo) internal tokenControlInfo;

    struct TokenImbalanceData {
        int256  lastBlockBuyUnitsImbalance;
        uint256 lastBlock;

        int256  totalBuyUnitsImbalance;
        uint256 lastRateUpdateBlock;
    }

    mapping(IERC20Ext => mapping(uint256=>uint256)) public tokenImbalanceData;

    constructor(address _admin) public Withdrawable(_admin) {}

    function setTokenControlInfo(
        IERC20Ext token,
        uint256 minimalRecordResolution,
        uint256 maxPerBlockImbalance,
        uint256 maxTotalImbalance
    )
        public
        onlyAdmin
    {
        tokenControlInfo[token] =
            TokenControlInfo(
                minimalRecordResolution,
                maxPerBlockImbalance,
                maxTotalImbalance
            );
    }

    function getTokenControlInfo(IERC20Ext token) public view returns(uint256, uint256, uint256) {
        return (tokenControlInfo[token].minimalRecordResolution,
                tokenControlInfo[token].maxPerBlockImbalance,
                tokenControlInfo[token].maxTotalImbalance);
    }

    function addImbalance(
        IERC20Ext token,
        int256 buyAmount,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    )
        internal
    {
        uint256 currentBlockIndex = currentBlock % SLIDING_WINDOW_SIZE;
        int256 recordedBuyAmount = int256(
            buyAmount / int256(tokenControlInfo[token].minimalRecordResolution)
        );

        int256 prevImbalance = 0;

        TokenImbalanceData memory currentBlockData =
            decodeTokenImbalanceData(tokenImbalanceData[token][currentBlockIndex]);

        // first scenario - this is not the first tx in the current block
        if (currentBlockData.lastBlock == currentBlock) {
            if (uint256(currentBlockData.lastRateUpdateBlock) == rateUpdateBlock) {
                // just increase imbalance
                currentBlockData.lastBlockBuyUnitsImbalance += recordedBuyAmount;
                currentBlockData.totalBuyUnitsImbalance += recordedBuyAmount;
            } else {
                // imbalance was changed in the middle of the block
                prevImbalance = getImbalanceInRange(token, rateUpdateBlock, currentBlock);
                currentBlockData.totalBuyUnitsImbalance = 
                    int256(prevImbalance) + recordedBuyAmount;
                currentBlockData.lastBlockBuyUnitsImbalance += recordedBuyAmount;
                currentBlockData.lastRateUpdateBlock = uint256(rateUpdateBlock);
            }
        } else {
            // first tx in the current block
            int256 currentBlockImbalance;
            (prevImbalance, currentBlockImbalance) = getImbalanceSinceRateUpdate(
                token, rateUpdateBlock, currentBlock
            );

            currentBlockData.lastBlockBuyUnitsImbalance = recordedBuyAmount;
            currentBlockData.lastBlock = uint256(currentBlock);
            currentBlockData.lastRateUpdateBlock = uint256(rateUpdateBlock);
            currentBlockData.totalBuyUnitsImbalance = int256(prevImbalance) + recordedBuyAmount;
        }

        tokenImbalanceData[token][currentBlockIndex] = encodeTokenImbalanceData(currentBlockData);
    }

    function setGarbageToVolumeRecorder(IERC20Ext token) internal {
        for (uint256 i = 0; i < SLIDING_WINDOW_SIZE; i++) {
            tokenImbalanceData[token][i] = 0x1;
        }
    }

    function getImbalanceInRange(
        IERC20Ext token,
        uint256 startBlock,
        uint256 endBlock
    ) internal view returns(int256 buyImbalance) {
        // check the imbalance in the sliding window
        require(startBlock <= endBlock, "end exceed start");

        buyImbalance = 0;

        for (uint256 windowInd = 0; windowInd < SLIDING_WINDOW_SIZE; windowInd++) {
            TokenImbalanceData memory perBlockData = decodeTokenImbalanceData(
                tokenImbalanceData[token][windowInd]
            );

            if (perBlockData.lastBlock <= endBlock && perBlockData.lastBlock >= startBlock) {
                buyImbalance += int256(perBlockData.lastBlockBuyUnitsImbalance);
            }
        }
    }

    function getImbalanceSinceRateUpdate(
        IERC20Ext token,
        uint256 rateUpdateBlock,
        uint256 currentBlock
    )
        internal view
        returns(int256 buyImbalance, int256 currentBlockImbalance)
    {
        buyImbalance = 0;
        currentBlockImbalance = 0;
        uint256 latestBlock = 0;
        int256 imbalanceInRange = 0;
        uint256 startBlock = rateUpdateBlock;
        uint256 endBlock = currentBlock;

        for (uint256 windowInd = 0; windowInd < SLIDING_WINDOW_SIZE; windowInd++) {
            TokenImbalanceData memory perBlockData = decodeTokenImbalanceData(
                tokenImbalanceData[token][windowInd]
            );

            if (perBlockData.lastBlock <= endBlock && perBlockData.lastBlock >= startBlock) {
                imbalanceInRange += perBlockData.lastBlockBuyUnitsImbalance;
            }

            if (perBlockData.lastRateUpdateBlock != rateUpdateBlock) continue;
            if (perBlockData.lastBlock < latestBlock) continue;

            latestBlock = perBlockData.lastBlock;
            buyImbalance = perBlockData.totalBuyUnitsImbalance;
            if (uint256(perBlockData.lastBlock) == currentBlock) {
                currentBlockImbalance = perBlockData.lastBlockBuyUnitsImbalance;
            }
        }

        if (buyImbalance == 0) {
            buyImbalance = imbalanceInRange;
        }
    }

    function getImbalance(IERC20Ext token, uint256 rateUpdateBlock, uint256 currentBlock)
        internal view
        returns(int256 totalImbalance, int256 currentBlockImbalance)
    {

        int256 resolution = int256(tokenControlInfo[token].minimalRecordResolution);

        (totalImbalance, currentBlockImbalance) =
            getImbalanceSinceRateUpdate(
                token,
                rateUpdateBlock,
                currentBlock);

        totalImbalance *= resolution;
        currentBlockImbalance *= resolution;
    }

    function getMaxPerBlockImbalance(IERC20Ext token) internal view returns(uint256) {
        return tokenControlInfo[token].maxPerBlockImbalance;
    }

    function getMaxTotalImbalance(IERC20Ext token) internal view returns(uint256) {
        return tokenControlInfo[token].maxTotalImbalance;
    }

    function encodeTokenImbalanceData(
        TokenImbalanceData memory data
    ) internal pure returns(uint256) {
        // check for overflows
        require(data.lastBlockBuyUnitsImbalance < int256(POW_2_64 / 2), "overflow");
        require(data.lastBlockBuyUnitsImbalance > int256(-1 * int256(POW_2_64) / 2), "overflow");
        require(data.lastBlock < POW_2_64, "overflow");
        require(data.totalBuyUnitsImbalance < int256(POW_2_64 / 2), "overflow");
        require(data.totalBuyUnitsImbalance > int256(-1 * int256(POW_2_64) / 2), "overflow");
        require(data.lastRateUpdateBlock < POW_2_64, "overflow");

        // do encoding
        uint256 result = uint256(data.lastBlockBuyUnitsImbalance) & (POW_2_64 - 1);
        result |= data.lastBlock * POW_2_64;
        result |= (uint256(data.totalBuyUnitsImbalance) & (POW_2_64 - 1)) * POW_2_64 * POW_2_64;
        result |= data.lastRateUpdateBlock * POW_2_64 * POW_2_64 * POW_2_64;

        return result;
    }

    function decodeTokenImbalanceData(uint256 input)
        internal pure returns(TokenImbalanceData memory) {
        TokenImbalanceData memory data;

        data.lastBlockBuyUnitsImbalance = int256(int64(input & (POW_2_64 - 1)));
        data.lastBlock = uint256(uint64((input / POW_2_64) & (POW_2_64 - 1)));
        data.totalBuyUnitsImbalance = int256(
            int64((input / (POW_2_64 * POW_2_64)) & (POW_2_64 - 1))
        );
        data.lastRateUpdateBlock = uint256(uint64((input / (POW_2_64 * POW_2_64 * POW_2_64))));

        return data;
    }
}
