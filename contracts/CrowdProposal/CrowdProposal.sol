// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import '../IToken.sol';
import '../ISliceGovernor.sol';

contract CrowdProposal {
    /// @notice The crowd proposal author
    address payable public immutable author;

    /// @notice Governance proposal data
    address[] public targets;
    uint[] public values;
    string[] public signatures;
    bytes[] public calldatas;
    string public description;

    /// @notice SLICE token contract address
    address public immutable slice;
    /// @notice Slice protocol `GovernorBravo` contract address
    address public immutable governor;

    /// @notice Governance proposal id
    uint public govProposalId;
    /// @notice Terminate flag
    bool public terminated;

    /// @notice An event emitted when the governance proposal is created
    event CrowdProposalProposed(address indexed proposal, address indexed author, uint proposalId);
    /// @notice An event emitted when the crowd proposal is terminated
    event CrowdProposalTerminated(address indexed proposal, address indexed author);
     /// @notice An event emitted when delegated votes are transfered to the governance proposal
    event CrowdProposalVoted(address indexed proposal, uint proposalId);

    /**
    * @notice Construct crowd proposal
    * @param author_ The crowd proposal author
    * @param targets_ The ordered list of target addresses for calls to be made
    * @param values_ The ordered list of values (i.e. msg.value) to be passed to the calls to be made
    * @param signatures_ The ordered list of function signatures to be called
    * @param calldatas_ The ordered list of calldata to be passed to each call
    * @param description_ The block at which voting begins: holders must delegate their votes prior to this block
    * @param slice_ `SLICE` token contract address
    * @param governor_ Slice protocol `GovernorBravo` contract address
    */
    constructor(address payable author_,
                address[] memory targets_,
                uint[] memory values_,
                string[] memory signatures_,
                bytes[] memory calldatas_,
                string memory description_,
                address slice_,
                address governor_) public {
        author = author_;

        // Save proposal data
        targets = targets_;
        values = values_;
        signatures = signatures_;
        calldatas = calldatas_;
        description = description_;

        // Save Slice contracts data
        slice = slice_;
        governor = governor_;

        terminated = false;

        // Delegate votes to the crowd proposal
        SliceInterface(slice_).delegate(address(this));
    }

    /// @notice Create governance proposal
    function propose() external returns (uint) {
        require(govProposalId == 0, 'CrowdProposal::propose: gov proposal already exists');
        require(!terminated, 'CrowdProposal::propose: proposal has been terminated');

        // Create governance proposal and save proposal id
        govProposalId = ISliceGovernor(governor).propose(targets, values, signatures, calldatas, description);
        emit CrowdProposalProposed(address(this), author, govProposalId);

        return govProposalId;
    }

    /// @notice Terminate the crowd proposal, send back staked SLICE tokens
    function terminate() external {
        require(msg.sender == author, 'CrowdProposal::terminate: only author can terminate');
        require(!terminated, 'CrowdProposal::terminate: proposal has been already terminated');

        terminated = true;

        // Transfer staked SLICE tokens from the crowd proposal contract back to the author
        SliceInterface(slice).transfer(author, SliceInterface(slice).balanceOf(address(this)));

        emit CrowdProposalTerminated(address(this), author);
    }

    /// @notice Vote for the governance proposal with all delegated votes
    function vote() external {
        require(govProposalId > 0, 'CrowdProposal::vote: gov proposal has not been created yet');
        // Support the proposal, vote value = 1
        ISliceGovernor(governor).castVote(govProposalId, 1);

        emit CrowdProposalVoted(address(this), govProposalId);
    }
}
