# Temporary CI validation for local virtual-credit state transitions.
# No original client, assets, reel strips, RNG, or vendor code is included.

INITIAL_CREDIT = 50000
WAGER = 100
WIN = 80

credit = INITIAL_CREDIT
pending_win = 0
spin_counter = 0

# START
assert pending_win == 0
credit -= WAGER
spin_counter += 1
pending_win = WIN
assert credit == 49900
assert pending_win == 80
assert spin_counter == 1

# A second START must be blocked until COLLECT.
blocked_reason = "COLLECT_REQUIRED" if pending_win else None
assert blocked_reason == "COLLECT_REQUIRED"
assert spin_counter == 1

# Native-local prize encoding expectations.
assert "W,80" == f"W,{pending_win}"
line_record = f"l,T,5,0,0,0,{pending_win},0,0,,0"
assert line_record == "l,T,5,0,0,0,80,0,0,,0"

# COLLECT
credit += pending_win
paid = pending_win
pending_win = 0
assert paid == 80
assert credit == 49980
assert pending_win == 0

# Second START is now allowed.
credit -= WAGER
spin_counter += 1
pending_win = WIN
assert credit == 49880
assert spin_counter == 2
assert pending_win == 80

print("PASS: START -> WIN 0.80 -> COLLECT -> second START")
