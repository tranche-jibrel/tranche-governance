// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;


interface SliceInterface {
    function getPriorVotes(address account, uint blockNumber) external view returns (uint96);
}
