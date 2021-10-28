const {
    BN,
    ether
  } = require('@openzeppelin/test-helpers');
  const {
    encodeParameters,
  } = require('../test/Utils/Ethereum');
  
  const SliceGovernor = artifacts.require('SliceGovernor');
  const Token = artifacts.require('Token');
  const CrowdProposalFactory = artifacts.require('CrowdProposalFactory');
  
  // const SLICE_ADDRESS = '0x0AeE8703D34DD9aE107386d3eFF22AE75Dd616D1';
  const SLICE_STAKE_AMOUNT = ether('1000');

  module.exports = async (deployer, network, accounts) => {
    const admin = accounts[0];
    if (network == 'development') {
      console.log(admin);
  
      const sInstance = await Token.deployed();
      console.log(sInstance.address);
  
      const sgInstance = await SliceGovernor.deployed();
      console.log(sgInstance.address);
        
      await deployer.deploy( CrowdProposalFactory, 
            sInstance.address, 
            sgInstance.address, 
            SLICE_STAKE_AMOUNT
        )
    
    } else if (network == 'kovan') {
      const { SLICE_ADDRESS } = process.env;
      
      const sgInstance = await SliceGovernor.deployed();
      console.log(sgInstance.address);
        
      await deployer.deploy( CrowdProposalFactory, 
            SLICE_ADDRESS, 
            sgInstance.address, 
            SLICE_STAKE_AMOUNT
          )
    }
  };
  