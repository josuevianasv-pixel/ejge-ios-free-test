import os,sys
sys.path.insert(0,os.path.dirname(__file__))
from verified_feature_rules import FeatureState, CoinAward

def prize(n=1):
    return CoinAward("PRIZE",n)

# 1) Trigger with exactly 6 coins -> LOCK_AND_SPIN, 3 respins.
s=FeatureState()
r=s.trigger_lock_and_spin([prize() for _ in range(6)])
assert r["mode"]=="LOCK_AND_SPIN"
assert r["locked_coins"]==6
assert r["lock_spins_remaining"]==3

# 2) Empty respin decrements 3 -> 2.
r=s.play_lock_spin([])
assert r["mode"]=="LOCK_AND_SPIN"
assert r["lock_spins_remaining"]==2

# 3) New Coin resets counter to 3.
r=s.play_lock_spin([prize(2)])
assert r["locked_coins"]==7
assert r["lock_spins_remaining"]==3

# 4) Three empty respins finish and return to BASE.
assert s.play_lock_spin([])["lock_spins_remaining"]==2
assert s.play_lock_spin([])["lock_spins_remaining"]==1
r=s.play_lock_spin([])
assert r["mode"]=="BASE"
done=r["lock_and_spin_completed"]
assert done["reason"]=="RESPINS_EXHAUSTED"
assert done["locked_coins"]==7
assert done["prize"]==8

# 5) SUPER + MEGA queue 35 Free Games after respins exhaust.
s=FeatureState()
s.trigger_lock_and_spin([
    CoinAward("SUPER"), CoinAward("MEGA"),
    prize(),prize(),prize(),prize()
])
s.play_lock_spin([])
s.play_lock_spin([])
r=s.play_lock_spin([])
assert r["mode"]=="FREE_GAMES"
assert r["free_games_remaining"]==35
assert r["lock_and_spin_completed"]["free_games_awarded"]==35

# 6) 15th Coin ends immediately with GRAND.
s=FeatureState()
s.trigger_lock_and_spin([prize() for _ in range(14)])
r=s.play_lock_spin([CoinAward("FREE_GAMES",5)])
done=r["lock_and_spin_completed"]
assert done["reason"]=="GRAND_15_COINS"
assert done["grand_awarded"] is True
assert done["locked_coins"]==15
assert r["mode"]=="FREE_GAMES"
assert r["free_games_remaining"]==5

# 7) MAJOR marker survives to completion.
s=FeatureState()
s.trigger_lock_and_spin([CoinAward("MAJOR"),prize(),prize(),prize(),prize(),prize()])
s.play_lock_spin([])
s.play_lock_spin([])
r=s.play_lock_spin([])
assert r["lock_and_spin_completed"]["major_awarded"] is True

print("PASS Lock Spin: trigger, decrement, reset, exhaust, SUPER/MEGA, GRAND, MAJOR")
