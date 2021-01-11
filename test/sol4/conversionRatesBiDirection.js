
let ConversionRatesBiDirection = artifacts.require("./ConversionRatesBiDirection.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");

const Helper = require("../helper.js");
const BN = web3.utils.BN;

//global variables
//////////////////
const {precisionUnits, zeroBN, ethDecimals} = require("../helper.js");

let admin;
let operator;
let alerter;
let reserveAddress;

let dai;
let usdc;
let wbtc;
let tokens;
let tokenAddresses = [];

const validRateDurationInBlocks = 1000;
const minimalRecordResolution = 10;
const maxPerBlockImbalance = new BN(50000);
const maxTotalImbalance = maxPerBlockImbalance.mul(new BN(12));

let buys = [];
let sells = [];
let indices = [];
let baseBuy = [];
let baseSell = [];
let imbalanceBuyStepX = [];
let imbalanceBuyStepY = [];
let imbalanceSellStepX = [];
let imbalanceSellStepY = [];
let compactBuyArr = [];
let compactSellArr = [];

let convRatesInst;

let qty;
let rate;

// getStepFunctionData command IDs
const comID_BuyRateStpQtyXLength = 0;
const comID_BuyRateStpQtyParamX = 1;
const comID_BuyRateStpQtyYLength = 2;
const comID_BuyRateStpQtyParamY = 3;

const comID_SellRateStpQtyXLength = 4;
const comID_SellRateStpQtyParamX = 5;
const comID_SellRateStpQtyYLength = 6;
const comID_SellRateStpQtyParamY = 7;

const comID_BuyRateStpImbalanceXLength = 8;
const comID_BuyRateStpImbalanceParamX = 9;
const comID_BuyRateStpImbalanceYLength = 10;
const comID_BuyRateStpImbalanceParamY = 11;

const comID_SellRateStpImbalanceXLength = 12;
const comID_SellRateStpImbalanceParamX = 13;
const comID_SellRateStpImbalanceYLength = 14;
const comID_SellRateStpImbalanceParamY = 15;

contract('ConversionRatesBiDirection', function(accounts) {
    before("should init globals", async() => {
        admin = accounts[1];
        alerter = accounts[2];
        operator = accounts[3];
        reserveAddress = accounts[4];

        // create tokens
        dai = await TestToken.new("DAI", "DAI", 18);
        wbtc = await TestToken.new("WBTC", "WBTC", 8);
        usdc = await TestToken.new("USDC", "USDC", 6);
        tokens = [dai, wbtc, usdc];
    });

    beforeEach("should init CRBiDirection contract", async() => {
        convRatesInst = await ConversionRatesBiDirection.new(admin, {from: admin});
        await convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks, {from: admin});
        await convRatesInst.addOperator(operator, {from: admin});
        await convRatesInst.setReserveAddress(reserveAddress, {from: admin});
        await convRatesInst.addAlerter(alerter, {from: admin});

        // add tokens
        for (let i = 0; i < tokens.length; i++) {
            token = tokens[i];
            tokenAddresses[i] = token.address;
            let tokenDecimals = await token.decimals();
            await convRatesInst.addToken(token.address, {from: admin});
            await convRatesInst.setTokenControlInfo(
                token.address,
                minimalRecordResolution,
                maxPerBlockImbalance.mul(new BN(10).pow(new BN(tokenDecimals))),
                maxTotalImbalance.mul(new BN(10).pow(new BN(tokenDecimals))),
                {from: admin}
                );
            await convRatesInst.enableTokenTrade(token.address, {from: admin});
        }
    });

    it("should set base rates", async() => {
        // set base rates
        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy
        // assuming we have no spread.
        let ethToTokenRate;
        let tokenToEthRate;

        for (i = 0; i < tokens.length; ++i) {
            ethToTokenRate = convertRateToPricingRate(true, (i + 1) * 10);
            tokenToEthRate = convertRateToPricingRate(false, (i + 1) * 10);
            baseBuy.push(ethToTokenRate);
            baseSell.push(tokenToEthRate);
        }

        Helper.assertEqual(baseBuy.length, tokens.length, "bad array length");
        Helper.assertEqual(baseSell.length, tokens.length, "bad array length");

        buys.length = sells.length = indices.length = 0;

        currentBlock = await Helper.getCurrentBlock();

        await convRatesInst.setBaseRate(tokenAddresses, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});
        //get base rate - validate data
        let thisSell;
        let thisBuy;
        for (i = 0; i < tokens.length; i++) {
            thisBuy = await convRatesInst.getBasicRate(tokenAddresses[i], true);
            thisSell = await convRatesInst.getBasicRate(tokenAddresses[i], false);
            Helper.assertEqual(thisBuy, baseBuy[i], "wrong base buy rate.");
            Helper.assertEqual(thisSell, baseSell[i], "wrong base sell rate.");
        }
    });

    it("should set compact data", async() => {
        //set compact data
        compactBuyArr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
        let compactBuyHex = Helper.bytesToHex(compactBuyArr);
        buys.push(compactBuyHex);

        compactSellArr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 30, 31, 32, 33, 34];
        let compactSellHex = Helper.bytesToHex(compactSellArr);
        sells.push(compactSellHex);

        indices[0] = 0;

        assert.deepEqual(indices.length, sells.length, "bad array size");
        assert.deepEqual(indices.length, buys.length, "bad array size");

        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        //get compact data for all tokens and verify as expected
        for (i = 0; i < tokens.length; ++i) {
            let arrIndex = Math.floor (i / 14);
            let fieldIndex = i % 14;
            let compactResArr = await convRatesInst.getCompactData(tokenAddresses[i]);
            let compactBuy;
            let compactSell;

            assert.equal(compactResArr[0], arrIndex, "wrong array " + i);
            assert.equal(compactResArr[1], fieldIndex, "wrong field index " + i);
            compactBuy = compactBuyArr;
            compactSell = compactSellArr;
            assert.equal(compactResArr[2], compactBuy[fieldIndex], "wrong buy: " + i);
            assert.equal(compactResArr[3], compactSell[fieldIndex], "wrong sell: " + i);
        }

        //get block number from compact data and verify
        let blockNum = await convRatesInst.getRateUpdateBlock(tokenAddresses[0]);

        Helper.assertEqual(blockNum, currentBlock, "bad block number returned");

        blockNum = await convRatesInst.getRateUpdateBlock(tokenAddresses[2]);

        Helper.assertEqual(blockNum, currentBlock, "bad block number returned");
    });

    it("should set quantity step functions, verify numbers", async() => {
        qtyBuyStepX = [15, 30, 70];
        qtyBuyStepY = [8, 30, 70];
        qtySellStepX = [155, 305, 705];
        qtySellStepY = [10, 32, 78];
        for (let i = 0; i < tokens.length; i++) {
            await convRatesInst.setQtyStepFunction(tokenAddresses[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
        }

        // pick a token
        tokenId = 1;

        // x axis
        let received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_BuyRateStpQtyXLength, 0); //get length
        Helper.assertEqual(received, qtyBuyStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_BuyRateStpQtyYLength, 0); //get length
        Helper.assertEqual(received, qtyBuyStepX.length, "length don't match");

        //iterate x and y values and compare
        for (let i = 0; i < qtyBuyStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_BuyRateStpQtyParamX, i); //get x value in cell i
            Helper.assertEqual(received, qtyBuyStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_BuyRateStpQtyParamY, i); //get x value in cell i
            Helper.assertEqual(received, qtyBuyStepY[i], "mismatch for y value in cell: " + i);
        }

        // pick a token
        tokenId = 2;

        // x axis
        received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_SellRateStpQtyXLength, 0); //get length
        Helper.assertEqual(received, qtySellStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_SellRateStpQtyYLength, 0); //get length
        Helper.assertEqual(received, qtySellStepX.length, "length don't match");

        //iterate x and y values and compare
        for (let i = 0; i < qtySellStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_SellRateStpQtyParamX, i); //get x value in cell i
            Helper.assertEqual(received, qtySellStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_SellRateStpQtyParamY, i); //get x value in cell i
            Helper.assertEqual(received, qtySellStepY[i], "mismatch for y value in cell: " + i);
        }
    });

    it("should set imbalance step functions, verify numbers", async() => {
        imbalanceBuyStepX = [180, 330, 900, 1500];
        imbalanceBuyStepY = [35, 150, 310, 1100];
        imbalanceSellStepX = [1500, 3000, 7000, 30000];
        imbalanceSellStepY = [45, 190, 360, 1800];
        for (let i = 0; i < tokens.length; i++) {
            await convRatesInst.setImbalanceStepFunction(tokenAddresses[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }

        // pick a token
        tokenId = 1;

        // x axis
        let received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_BuyRateStpImbalanceXLength, 0); //get length
        Helper.assertEqual(received, imbalanceBuyStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_BuyRateStpImbalanceYLength, 0); //get length
        Helper.assertEqual(received, imbalanceBuyStepY.length, "length don't match");

        //iterate x and y values and compare
        for (let i = 0; i < imbalanceBuyStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_BuyRateStpImbalanceParamX, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceBuyStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_BuyRateStpImbalanceParamY, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceBuyStepY[i], "mismatch for y value in cell: " + i);
        }

        tokenId = 0;

        // x axis
        received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_SellRateStpImbalanceXLength, 0); //get length
        Helper.assertEqual(received, imbalanceSellStepX.length, "length don't match");

        // now y axis
        received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_SellRateStpImbalanceYLength, 0); //get length
        Helper.assertEqual(received, imbalanceSellStepX.length, "length don't match");

        //iterate x and y values and compare
        for (let i = 0; i < imbalanceSellStepX.length; ++i) {
            received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_SellRateStpImbalanceParamX, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceSellStepX[i], "mismatch for x value in cell: " + i);
            received = await convRatesInst.getStepFunctionData(tokenAddresses[tokenId], comID_SellRateStpImbalanceParamY, i); //get x value in cell i
            Helper.assertEqual(received, imbalanceSellStepY[i], "mismatch for x value in cell: " + i);
        }
    });

    describe("test fetchRate function", async() => {
        beforeEach("set base rates and compact data and step functions", async() => {
            // set base rates
            currentBlock = await Helper.getCurrentBlock();
            buys.length = sells.length = indices.length = 0;
            await convRatesInst.setBaseRate(tokenAddresses, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

            // set compact data
            compactBuyArr = [5, 10, 15];
            let compactBuyHex = Helper.bytesToHex(compactBuyArr);
            buys.push(compactBuyHex);

            compactSellArr = [-5, -10, -15];
            let compactSellHex = Helper.bytesToHex(compactSellArr);
            sells.push(compactSellHex);

            indices = [0];

            await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        });

        describe("test with qty step functions only", async() => {
            beforeEach("set qty step functions and empty imbalance step functions", async() => {
                // qty step functions
                qtyBuyStepX = [0, 1000, 2000, 3000];
                qtyBuyStepY = [0, -5, -10, -15];
                qtySellStepX = [0, 1000, 2000, 3000];
                qtySellStepY = [0, -5, -10, -15];
                imbalanceBuyStepX = [0];
                imbalanceBuyStepY = [0];
                imbalanceSellStepX = [0];
                imbalanceSellStepY = [0];
                for (let i = 0; i < tokens.length; i++) {
                    await convRatesInst.setQtyStepFunction(tokenAddresses[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
                    await convRatesInst.setImbalanceStepFunction(
                        tokenAddresses[i],
                        imbalanceBuyStepX,
                        imbalanceBuyStepY,
                        imbalanceSellStepX,
                        imbalanceSellStepY,
                        {from:operator}
                    );
                }
            });

            it("should be able to get updated rate with 0 src and dest qty", async() => {
                currentBlock = await Helper.getCurrentBlock();
                qty = zeroBN;
                tokenId = 0;
                // buy rates
                rate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, true, qty, true);
                Helper.assertGreater(rate, baseBuy[tokenId], "compact data update failed");
                rate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, true, qty, false);
                Helper.assertGreater(rate, baseBuy[tokenId], "compact data update failed");

                // sell rates
                rate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, false, qty, true);
                Helper.assertLesser(rate, baseSell[tokenId], "compact data update failed");
                rate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, false, qty, false);
                Helper.assertLesser(rate, baseSell[tokenId], "compact data update failed");
            });

            it("should return correct buy rate according to qty step function, using both fixed src and dest quantities", async() => {
                currentBlock = await Helper.getCurrentBlock();
                tokenId = 1;
                qty = zeroBN;
                let tokenDecimals = await tokens[tokenId].decimals();
                let initialRate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, true, qty, true);
                // buy rates
                for (let i = 500; i <= 2500; i+=1000) {
                    // fix destQty
                    qty = new BN(i);
                    rate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, true, qty, false);
                    Helper.assertLesser(rate, initialRate, "actual rate didn't change according to step function");
                    
                    initialRate = rate;

                    // fix srcQty
                    qty = Helper.calcSrcQty(i, ethDecimals, tokenDecimals, initialRate);
                    rate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, true, qty, true);
                    Helper.assertEqual(initialRate, rate, "rate via fixed src qty != rate via fixed dest qty");
                }
            });

            it("should return correct sell rate according to qty step function, using both fixed src and dest quantities", async() => {
                currentBlock = await Helper.getCurrentBlock();
                tokenId = 1;
                qty = zeroBN;
                let tokenDecimals = await tokens[tokenId].decimals();
                let initialRate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, false, qty, true);
                // buy rates
                for (let i = 500; i <= 2500; i+=1000) {
                    // fix destQty
                    qty = Helper.calcDstQty(new BN(i), tokenDecimals, ethDecimals, initialRate);
                    rate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, false, qty, false);
                    Helper.assertLesser(rate, initialRate, "actual rate didn't change according to step function");
                    
                    initialRate = rate;

                    // fix srcQty
                    qty = new BN(i);
                    rate = await convRatesInst.fetchRate(tokenAddresses[tokenId], currentBlock, false, qty, true);
                    Helper.assertEqual(initialRate, rate, "rate via fixed src qty != rate via fixed dest qty");
                }
            });
        });

        describe("test with imbalance step functions only", async() => {
            beforeEach("set imabalance step functions and empty qty step functions", async() => {
                // qty step functions
                qtyBuyStepX = [0];
                qtyBuyStepY = [0];
                qtySellStepX = [0];
                qtySellStepY = [0];
                imbalanceBuyStepX = [0, 1000, 2000, 3000];
                imbalanceBuyStepY = [0, -5, -10, -15];
                imbalanceSellStepX = [0, 1000, 2000, 3000];
                imbalanceSellStepY = [0, -5, -10, -15];
                for (let i = 0; i < tokens.length; i++) {
                    await convRatesInst.setQtyStepFunction(tokenAddresses[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {from:operator});
                    await convRatesInst.setImbalanceStepFunction(
                        tokenAddresses[i],
                        imbalanceBuyStepX,
                        imbalanceBuyStepY,
                        imbalanceSellStepX,
                        imbalanceSellStepY,
                        {from:operator}
                    );
                }
            });
        });
    });
});

function convertRateToPricingRate(isBuy, baseRate) {
    // conversion rate in pricing is in precision units (10 ** 18) so
    // rate 1 to 50 is 50 * 10 ** 18
    // rate 50 to 1 is 1 / 50 * 10 ** 18
    if (isBuy) return precisionUnits.mul(new BN(baseRate));
    return precisionUnits.div(new BN(baseRate));
};
