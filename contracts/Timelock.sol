// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/math/SafeMath.sol';
// import '@openzeppelin/contracts/access/Ownable.sol';

contract Timelock {
    using SafeMath for uint;

    event NewAdmin(address indexed newAdmin);
    event NewPendingAdmin(address indexed newPendingAdmin);
    event NewDelay(uint indexed newDelay);
    event CancelTransaction(bytes32 indexed txHash, address indexed target, uint value, string signature,  bytes data, uint eta);
    event ExecuteTransaction(bytes32 indexed txHash, address indexed target, uint value, string signature,  bytes data, uint eta);
    event QueueTransaction(bytes32 indexed txHash, address indexed target, uint value, string signature, bytes data, uint eta);

    uint public constant GRACE_PERIOD = 14 days; // Transaction is stale if time is before the end time plus 14 days
    uint public constant MINIMUM_DELAY = 2 days;
    uint public constant MAXIMUM_DELAY = 30 days; // min and max time for voting a proposal

    address public admin;
    address public governanceAddress;
    uint public delay;

    mapping (bytes32 => bool) public queuedTransactions;


    constructor(address admin_, uint delay_) public {
        require(delay_ >= MINIMUM_DELAY, 'Timelock::constructor: Delay must exceed minimum delay.');
        require(delay_ <= MAXIMUM_DELAY, 'Timelock::setDelay: Delay must not exceed maximum delay.');

        admin = admin_;
        delay = delay_;
    }

    modifier onlyGovernor() {
        require(msg.sender == governanceAddress, 'Not a governor');
        _;
    }

    fallback() external payable { }

    function setSliceGovAddress(address _govAddress) external {
        require(msg.sender == admin, 'Timelock::setSliceGovAddress: Call must come from admin.');
        governanceAddress = _govAddress;
    }

    function setDelay(uint delay_) public {
        require(msg.sender == address(this), 'Timelock::setDelay: Call must come from Timelock.');
        require(delay_ >= MINIMUM_DELAY, 'Timelock::setDelay: Delay must exceed minimum delay.');
        require(delay_ <= MAXIMUM_DELAY, 'Timelock::setDelay: Delay must not exceed maximum delay.');
        delay = delay_;

        emit NewDelay(delay);
    }

    function acceptAdmin(address _caller) public onlyGovernor {
        admin = _caller;
        emit NewAdmin(admin);
    }

    function queueTransaction(address target, uint value, string memory signature, bytes memory data, uint eta) public onlyGovernor returns (bytes32) {
        require(eta >= getBlockTimestamp().add(delay), 'Timelock::queueTransaction: Estimated execution block must satisfy delay.');

        bytes32 txHash = keccak256(abi.encode(target, value, signature, data, eta));
        queuedTransactions[txHash] = true;

        emit QueueTransaction(txHash, target, value, signature, data, eta);
        return txHash;
    }

    function cancelTransaction(address target, uint value, string memory signature, bytes memory data, uint eta) public onlyGovernor {
        bytes32 txHash = keccak256(abi.encode(target, value, signature, data, eta));
        queuedTransactions[txHash] = false;

        emit CancelTransaction(txHash, target, value, signature, data, eta);
    }

    function executeTransaction(address target, uint value, string memory signature, bytes memory data, uint eta) public payable onlyGovernor returns (bytes memory) {
        bytes32 txHash = keccak256(abi.encode(target, value, signature, data, eta));
        require(queuedTransactions[txHash], 'Timelock::executeTransaction: Transaction has not been queued.');
        require(getBlockTimestamp() >= eta, 'Timelock::executeTransaction: Transaction has not surpassed time lock.');
        require(getBlockTimestamp() <= eta.add(GRACE_PERIOD), 'Timelock::executeTransaction: Transaction is stale.');

        queuedTransactions[txHash] = false;

        bytes memory callData;

        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), data);
        }

        // solium-disable-next-line security/no-call-value
        (bool success, bytes memory returnData) = target.call{value:value}(callData);
        require(success, 'Timelock::executeTransaction: Transaction execution reverted.');

        emit ExecuteTransaction(txHash, target, value, signature, data, eta);

        return returnData;
    }

    function getBlockTimestamp() internal view returns (uint) {
        return block.timestamp;
    }
}