using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

public static class LogLockHarness {
    static readonly object Sync = new object();
    static readonly Queue<string> MemoryLog = new Queue<string>();
    static string LogFile = "";

    static void Log(string s){
        string line=DateTime.Now.ToString("s")+" "+s;
        lock(Sync){
            MemoryLog.Enqueue(line);
            while(MemoryLog.Count>120) MemoryLog.Dequeue();
            try {
                if(!string.IsNullOrEmpty(LogFile)){
                    using(var fs=new FileStream(LogFile,FileMode.Append,FileAccess.Write,FileShare.ReadWrite|FileShare.Delete))
                    using(var sw=new StreamWriter(fs,Encoding.UTF8)){ sw.WriteLine(line); }
                }
            } catch { }
        }
    }

    static void ResetLogFile(){
        lock(Sync){
            MemoryLog.Clear();
            try {
                using(var fs=new FileStream(LogFile,FileMode.Create,FileAccess.Write,FileShare.ReadWrite|FileShare.Delete))
                using(var sw=new StreamWriter(fs,Encoding.UTF8)){ sw.WriteLine("Original local client server start"); }
            } catch { }
        }
    }

    static string DebugMux(){
        var sb=new StringBuilder();
        string[] lines;
        lock(Sync){ lines=MemoryLog.ToArray(); }
        int start=Math.Max(0,lines.Length-18);
        for(int i=start;i<lines.Length;i++) sb.AppendLine(lines[i]);
        return sb.ToString();
    }

    public static int Main(string[] args){
        string root=args[0];
        Directory.CreateDirectory(root);
        LogFile=Path.Combine(root,"mux.log");
        ResetLogFile();
        Log("BOOT");

        // Simulate another process holding mux.log without write sharing,
        // which used to throw IOException and kill the WebSocket path.
        using(var blocker=new FileStream(LogFile,FileMode.Open,FileAccess.Read,FileShare.Read)){
            Log("CLIENT cmd=48");
            string debug=DebugMux();
            if(!debug.Contains("CLIENT cmd=48")) throw new Exception("in-memory diagnostics missing cmd48");
        }

        Log("BOOTSTRAP SENT after 48");
        if(!DebugMux().Contains("BOOTSTRAP SENT after 48")) throw new Exception("post-lock logging failed");
        Console.WriteLine("PASS: mux.log lock cannot terminate logging/bootstrap path");
        return 0;
    }
}
