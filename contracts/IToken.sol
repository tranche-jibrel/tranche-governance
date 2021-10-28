// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface SliceInterface {
    function getPriorVotes(address account, uint blockNumber) external view returns (uint96);
    function delegate(address delegatee) external;
    function balanceOf(address account) external view returns (uint);
    function transfer(address dst, uint rawAmount) external returns (bool);
    function transferFrom(address src, address dst, uint rawAmount) external returns (bool);
}
