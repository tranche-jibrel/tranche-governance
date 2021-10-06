const {
  BN,
  ether
} = require('@openzeppelin/test-helpers');

const Timelock = artifacts.require('Timelock');
const SliceGovernor = artifacts.require('SliceGovernor');
const Token = artifacts.require('Token');

// const SLICE_ADDRESS = '0x0AeE8703D34DD9aE107386d3eFF22AE75Dd616D1';
const PROP_THR = ether('250000');

module.exports = async (deployer, network, accounts) => {
  const admin = accounts[0];
  if (network == 'development') {
    console.log(admin);

    await deployer.deploy(Token, 'Slice Token', 'SLICE', 20000000, 1664028133);
    const sInstance = await Token.deployed();
    console.log(sInstance.address);

    await deployer.deploy(Timelock, admin, 172800);  // 2 days
    const tlInstance = await Timelock.deployed();
    console.log(tlInstance.address);

    await deployer.deploy(SliceGovernor);
    const sgInstance = await SliceGovernor.deployed();
    console.log(sgInstance.address);

    await tlInstance.setSliceGovAddress(sgInstance.address)

    await sgInstance.initialize(tlInstance.address, sInstance.address, 17280, 1, PROP_THR)
  } else if (network == 'kovan') {
    const { SLICE_ADDRESS } = process.env;
    await deployer.deploy(Timelock, admin, 172800);  // 2 days
    const tlInstance = await Timelock.deployed();
    console.log(tlInstance.address);

    await deployer.deploy(SliceGovernor);
    const sgInstance = await SliceGovernor.deployed();
    console.log(sgInstance.address);

    await tlInstance.setSliceGovAddress(sgInstance.address)

    await sgInstance.initialize(tlInstance.address, SLICE_ADDRESS, 17280, 1, PROP_THR)
  }
};
