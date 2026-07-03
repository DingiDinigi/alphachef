// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract AlphaChef {
    address public owner;
    address public platformWallet;
    address public usdcToken;
    uint256 public platformFeeBps = 1000; // 10%

    struct Signal {
        string signalId;
        uint256 priceUsdc; // 6-decimal USDC units
        uint256 totalUnlocks;
        uint256 totalRevenue;
        bool exists;
    }

    mapping(string => Signal) public signalRegistry;
    mapping(string => mapping(address => bool)) public hasUnlocked;

    event SignalRegistered(string indexed signalId, uint256 priceUsdc, uint256 timestamp);
    event SignalUnlocked(string indexed signalId, address indexed reader, uint256 amountPaid, uint256 timestamp);

    error SignalNotFound();
    error AlreadyUnlocked();
    error InsufficientAllowance();
    error PaymentFailed();

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _platformWallet, address _usdcToken) {
        owner = msg.sender;
        platformWallet = _platformWallet;
        usdcToken = _usdcToken;
    }

    function registerSignal(string calldata signalId, uint256 priceUsdc) external onlyOwner {
        signalRegistry[signalId] = Signal({
            signalId: signalId,
            priceUsdc: priceUsdc,
            totalUnlocks: 0,
            totalRevenue: 0,
            exists: true
        });
        emit SignalRegistered(signalId, priceUsdc, block.timestamp);
    }

    function unlockSignal(string calldata signalId) external {
        Signal storage signal = signalRegistry[signalId];
        if (!signal.exists) revert SignalNotFound();
        if (hasUnlocked[signalId][msg.sender]) revert AlreadyUnlocked();

        uint256 price = signal.priceUsdc;
        IERC20 usdc = IERC20(usdcToken);

        if (usdc.allowance(msg.sender, address(this)) < price) revert InsufficientAllowance();

        uint256 fee = (price * platformFeeBps) / 10000;
        uint256 remaining = price - fee;

        bool ok1 = usdc.transferFrom(msg.sender, platformWallet, fee);
        bool ok2 = usdc.transferFrom(msg.sender, owner, remaining);
        if (!ok1 || !ok2) revert PaymentFailed();

        hasUnlocked[signalId][msg.sender] = true;
        signal.totalUnlocks++;
        signal.totalRevenue += price;

        emit SignalUnlocked(signalId, msg.sender, price, block.timestamp);
    }

    function getSignal(string calldata signalId) external view returns (
        uint256 priceUsdc,
        uint256 totalUnlocks,
        uint256 totalRevenue,
        bool exists,
        bool callerUnlocked
    ) {
        Signal storage s = signalRegistry[signalId];
        return (s.priceUsdc, s.totalUnlocks, s.totalRevenue, s.exists, hasUnlocked[signalId][msg.sender]);
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        platformWallet = _wallet;
    }

    function setPlatformFee(uint256 _bps) external onlyOwner {
        require(_bps <= 3000, "Max 30%");
        platformFeeBps = _bps;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
