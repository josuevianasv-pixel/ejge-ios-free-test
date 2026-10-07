using System;
public static class R1169CollectHarness {
    static int Credit=49800, Win=50, Spin=2;
    static bool LockSpinActive=false, LockSpinEnding=false, FreeGamesActive=false, FreeGamesEnding=false;
    public static string Handle51(){
        bool collectedFromStart=false; int fallbackPaid=0;
        if(Win>0 && !LockSpinActive && !FreeGamesActive){
            fallbackPaid=Win; Credit+=Win; Win=0;
            collectedFromStart=true;
        } else if(Win==0 && !LockSpinActive && !LockSpinEnding && !FreeGamesActive && !FreeGamesEnding){
            Credit-=100; Spin++;
        }
        return collectedFromStart ? "COLLECT:"+fallbackPaid : "SPIN";
    }
    public static int Main(){
        var beforeSpin=Spin; var beforeCredit=Credit;
        var action=Handle51();
        if(action!="COLLECT:50") throw new Exception("pending WIN was not collected");
        if(Win!=0) throw new Exception("WIN not cleared");
        if(Credit!=beforeCredit+50) throw new Exception("credit not incremented exactly once");
        if(Spin!=beforeSpin) throw new Exception("fallback incorrectly started a new spin");
        Console.WriteLine("PASS R1.16.9 pending-win START fallback: collect-only, no wager, no extra spin");
        return 0;
    }
}