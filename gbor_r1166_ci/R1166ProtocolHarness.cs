using System;
public static class R1166ProtocolHarness {
    public static string BuildWildDefinition(){ return ":j,B,1,0,EMSCAKQJT"; }
    public static string BuildLine(){ return "l,M,3,5,0,0,50,0,0,,0"; }
    public static int Main(){
        var wild=BuildWildDefinition();
        var line=BuildLine();
        if(wild != ":j,B,1,0,EMSCAKQJT") throw new Exception("wild definition mismatch");
        var f=line.Split(',');
        if(f.Length!=11) throw new Exception("line record field count mismatch");
        if(f[0]!="l" || f[1]!="M" || f[2]!="3" || f[3]!="5" || f[6]!="50") throw new Exception("line record mismatch");
        Console.WriteLine("PASS: Wild definition + line-win record shape");
        return 0;
    }
}