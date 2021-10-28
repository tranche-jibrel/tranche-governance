// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import { SliceInterface } from '../IToken.sol';
import { CrowdProposal } from './CrowdProposal.sol';

contract CrowdProposalFactory {
    /// @notice `SLICE` token contract address
    address public immutable slice;
    /// @notice Slice Governor contract address
    address public immutable governor;
    /// @notice Minimum Slice tokens required to create a crowd proposal
    uint public immutable sliceStakeAmount;

    /// @notice An event emitted when a crowd proposal is created
    event CrowdProposalCreated(address indexed proposal, address indexed author, address[] targets, uint[] values, string[] signatures, bytes[] calldatas, string description);

     /**
     * @notice Construct a proposal factory for crowd proposals
     * @param slice_ `SLICE` token contract address
     * @param governor_ Slice Governor contract address
     * @param sliceStakeAmount_ The minimum amount of SLICE tokens required for creation of a crowd proposal
     */
    constructor(address slice_,
                address governor_,
                uint sliceStakeAmount_) public {
        slice = slice_;
        governor = governor_;
        sliceStakeAmount = sliceStakeAmount_;
    }

    /**
    * @notice Create a new crowd proposal
    * @notice Call `Slice.approve(factory_address, sliceStakeAmount)` before calling this method
    * @param targets The ordered list of target addresses for calls to be made
    * @param values The ordered list of values (i.e. msg.value) to be passed to the calls to be made
    * @param signatures The ordered list of function signatures to be called
    * @param calldatas The ordered list of calldata to be passed to each call
    * @param description The block at which voting begins: holders must delegate their votes prior to this block
    */
    function createCrowdProposal(address[] memory targets,
                                 uint[] memory values,
                                 string[] memory signatures,
                                 bytes[] memory calldatas,
                                 string memory description) external {
        CrowdProposal proposal = new CrowdProposal(msg.sender, targets, values, signatures, calldatas, description, slice, governor);
        emit CrowdProposalCreated(address(proposal), msg.sender, targets, values, signatures, calldatas, description);

        // Stake SLICE and force proposal to delegate votes to itself
        SliceInterface(slice).transferFrom(msg.sender, address(proposal), sliceStakeAmount);
    }
}