using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class OriginalLocalServer {
    static readonly object Sync = new object();
    static string Root = "";
    static string LogFile = "";
    static int Credit = 50000;
    static int Spin = 0;
    static int Win = 0;
    static volatile int LastClientCommand = -1;
    static volatile bool BootstrapSent = false;
    static volatile bool WsConnected = false;
    static string LastUnhandled = "";
    static int[] Stops = new int[] {0,0,0,0,0};
    static bool ForceLockSpinNext = false;
    static bool LockSpinActive = false;
    static int LockSpinsLeft = 0;
    static int LockStep = 0;
    static readonly int[] LockValues = new int[15];
    static readonly int[] LockStops = new int[15];
    const char Sep = '\u00ff';
    static int Port = 18777;
    static TcpListener Listener = null;
    static Thread ServerThread = null;
    static readonly ManualResetEventSlim Ready = new ManualResetEventSlim(false);
    public static volatile bool IsRunning = false;
    public static string LastError = "";
    static readonly string[] Lines = new string[]{"-----","^^^^^","_____","^-_-^","_-^-_","^^-__","__-^^","-^^^-","-___-","^---^"};
    static readonly string BaseStrip = BuildStrip("EMSCAKQJTBD",160);
    static readonly string FreeStrip = BuildStrip("EMSCAKQJTG",160);

    static string BuildStrip(string seed,int n){ var sb=new StringBuilder(); while(sb.Length<n) sb.Append(seed); return sb.ToString(0,n); }
    static void Log(string s){ lock(Sync){ File.AppendAllText(LogFile,DateTime.Now.ToString("s")+" "+s+Environment.NewLine); } }
    static string Packet(int id, params string[] fields){ return ((char)id).ToString() + (fields.Length==0 ? "" : string.Join(Sep.ToString(),fields)); }
    static string Case6(bool definition){
        var r=new List<string>();
        r.Add("S"+Credit); r.Add("C,100,USD,0,USD"); r.Add("R"+Spin); r.Add("A1"); r.Add(Win>0?"I10":"I00"); r.Add("W,"+Win);
        if(definition){
            r.Add(":n,Cash Connection Golden Book of Ra");
            foreach(var l in Lines) r.Add(":l,"+l);
            r.Add(":i,10"); r.Add(":m,10"); r.Add(":f,0");
            for(int i=0;i<5;i++) r.Add(":r,0,"+BaseStrip);
            for(int i=0;i<5;i++) r.Add(":r,1,"+FreeStrip);
            r.Add(":v,3");
            AddPay(r,"E",8,24,100); AddPay(r,"M",5,12,40); AddPay(r,"S",4,9,30); AddPay(r,"C",3,7,22); AddPay(r,"A",3,6,18); AddPay(r,"K",2,5,14); AddPay(r,"Q",2,4,12); AddPay(r,"J",2,4,10); AddPay(r,"T",1,3,8);
            r.Add(":b,1,10"); r.Add("e,10,10,0,-1"); r.Add("s,1,0"); r.Add("bs,0,1,0"); r.Add("jp,Grand:100000,Major:25000");
        } else { r.Add("e,10,10,0,-1"); r.Add("s,1,0"); r.Add("bs,0,1,0"); }
        if(LockSpinActive){
            string dv=BuildDiamondValues();
            string dl=BuildDiamondLink(LockStep==0);
            r.Add("x,0,"+dv+","+dl);
            r.Add("v,"+dl+",0");
        } else {
            r.Add("x,0,dv:-1;-1;-1;-1;-1;-1;-1;-1;-1;-1;-1;-1;-1;-1;-1");
        }
        r.Add("f,0,0,1,1,0,0,0,0,0,0"); r.Add("r,0,5,"+string.Join(",",Stops)); r.Add("rw,0");
        return Packet(6,r.ToArray());
    }
    static string BuildDiamondValues(){
        var a=new string[15];
        for(int i=0;i<15;i++) a[i]=LockValues[i].ToString();
        return "dv:"+string.Join(";",a);
    }
    static string BuildDiamondLink(bool init){
        var a=new string[16 + (init?1:0)];
        for(int i=0;i<15;i++) a[i]=LockStops[i]+":"+LockValues[i];
        a[15]=LockSpinsLeft.ToString();
        if(init) a[16]="o";
        return "dl:"+string.Join(";",a);
    }
    static void ResetLockSpin(){
        LockSpinActive=false; LockSpinsLeft=0; LockStep=0;
        for(int i=0;i<15;i++){ LockValues[i]=-1; LockStops[i]=i; }
    }
    static void StartLockSpin(){
        ResetLockSpin();
        LockSpinActive=true; LockSpinsLeft=3; LockStep=0; Win=0;
        for(int i=0;i<6;i++){ LockValues[i]=1; LockStops[i]=Stops[i%5]; }
        Log("LOCKSPIN START cells=6 spins=3");
    }
    static void AdvanceLockSpin(){
        if(!LockSpinActive) return;
        LockStep++;
        LockSpinsLeft--;
        if(LockStep==2 && LockValues[6]<0){
            LockValues[6]=2; LockStops[6]=(Stops[1]+17)%160; LockSpinsLeft=3;
            Log("LOCKSPIN NEW_COIN cell=6 value=2 reset=3");
        }
        if(LockSpinsLeft<=0){
            int prize=0; for(int i=0;i<15;i++) if(LockValues[i]>0 && LockValues[i]<10000) prize += LockValues[i]*100;
            LockSpinActive=false; Win=prize; Log("LOCKSPIN END win="+Win);
        } else Log("LOCKSPIN RESPIN step="+LockStep+" left="+LockSpinsLeft);
    }
    static void AddPay(List<string> r,string s,int a,int b,int c){ r.Add(":w,"+s+",3,"+a+",0,0"); r.Add(":w,"+s+",4,"+b+",0,0"); r.Add(":w,"+s+",5,"+c+",0,0"); }

    static void RunInternal(string root,int port){
        Root=root; Port=port; LogFile=Path.Combine(root,"mux.log");
        try {
            File.WriteAllText(LogFile,"Original local client server start"+Environment.NewLine);
            ResetLockSpin();
            Listener=new TcpListener(IPAddress.Loopback,Port);
            Listener.Start();
            IsRunning=true; LastError=""; Ready.Set();
            Log("LISTEN http://127.0.0.1:"+Port+"/");
            while(IsRunning){
                try {
                    var c=Listener.AcceptTcpClient();
                    Task.Run(()=>Handle(c));
                } catch(SocketException){ if(!IsRunning) break; throw; }
                  catch(ObjectDisposedException){ if(!IsRunning) break; throw; }
            }
        } catch(Exception ex){
            LastError=ex.GetType().Name+": "+ex.Message;
            try { Log("SERVERERR "+LastError); } catch {}
            Ready.Set();
        } finally {
            IsRunning=false;
            try { if(Listener!=null) Listener.Stop(); } catch {}
            Listener=null;
            try { Log("SERVER STOP"); } catch {}
        }
    }
    public static bool Start(string root,int port,int timeoutMs){
        Stop();
        Ready.Reset(); LastError=""; IsRunning=false;
        ServerThread=new Thread(()=>RunInternal(root,port));
        ServerThread.IsBackground=true;
        ServerThread.Name="BookOfRaOriginalLocalServer";
        ServerThread.Start();
        if(!Ready.Wait(timeoutMs)){ LastError="Timeout esperando que el servidor abra el puerto"; return false; }
        return IsRunning;
    }
    public static void Stop(){
        IsRunning=false;
        try { if(Listener!=null) Listener.Stop(); } catch {}
        try { if(ServerThread!=null && ServerThread.IsAlive) ServerThread.Join(1500); } catch {}
        ServerThread=null;
    }
    public static void Run(string root){ RunInternal(root,18777); }
    static void Handle(TcpClient client){ using(client){ try{ client.ReceiveTimeout=0; client.SendTimeout=30000; var s=client.GetStream(); var head=ReadHeaders(s); if(head==null)return; var lines=head.Split(new[]{"\r\n"},StringSplitOptions.None); if(lines.Length==0)return; var first=lines[0].Split(' '); if(first.Length<2)return; var path=first[1].Split('?')[0]; var h=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase); for(int i=1;i<lines.Length;i++){ int p=lines[i].IndexOf(':'); if(p>0)h[lines[i].Substring(0,p).Trim()]=lines[i].Substring(p+1).Trim(); }
            if(path=="/mux" && h.ContainsKey("Upgrade") && h["Upgrade"].Equals("websocket",StringComparison.OrdinalIgnoreCase)){ HandleWs(s,h); return; }
            if(path=="/") { SendFile(s,Path.Combine(Root,"launcher.html"),"text/html; charset=utf-8"); return; }
            if(path=="/status") { SendText(s,"{\"credit\":"+Credit+",\"spin\":"+Spin+",\"win\":"+Win+",\"lockSpinActive\":"+(LockSpinActive?"true":"false")+",\"lockSpinsLeft\":"+LockSpinsLeft+"}","application/json"); return; }
            if(path=="/debug/mux") { SendText(s,DebugMux(),"text/plain; charset=utf-8"); return; }
            if(path=="/debug/force-lock-spin") { ForceLockSpinNext=true; SendText(s,"OK force Lock & Spin on next START","text/plain; charset=utf-8"); return; }
            if(path.StartsWith("/native-static/")){ var rel=Uri.UnescapeDataString(path.Substring(1)).Replace('/' , Path.DirectorySeparatorChar); if(rel.Contains("..")){Send404(s);return;} var f=Path.Combine(Root,rel); if(!File.Exists(f) && (f.EndsWith(".png")||f.EndsWith(".jpg"))) f += ".webp"; if(File.Exists(f)){ SendFile(s,f,Mime(f)); return; } Log("404 "+path); Send404(s); return; }
            if(path.StartsWith("/com/") || path.StartsWith("/sk/")){
                var decoded=Uri.UnescapeDataString(path.TrimStart('/'));
                if(decoded.Contains("..") || decoded.Contains("\\")){ Send404(s); return; }
                var nativeRoot=Path.Combine(Root,"native-static");
                string[] bundles=Directory.Exists(nativeRoot)?Directory.GetDirectories(nativeRoot):new string[0];
                if(bundles.Length==1){
                    var f=Path.Combine(bundles[0],decoded.Replace('/',Path.DirectorySeparatorChar));
                    if(!File.Exists(f) && (f.EndsWith(".png")||f.EndsWith(".jpg"))) f += ".webp";
                    if(File.Exists(f)){ SendFile(s,f,Mime(f)); return; }
                }
                Log("404 "+path); Send404(s); return;
            }
            Send404(s);
        }catch(Exception ex){ Log("HTTPERR "+ex.GetType().Name+" "+ex.Message); } } }
    static string DebugMux(){
        var sb=new StringBuilder();
        sb.AppendLine("WS="+(WsConnected?"OPEN":"CLOSED")+" BOOTSTRAP="+(BootstrapSent?"YES":"NO")+" LAST_CMD="+LastClientCommand+" CREDIT="+Credit+" SPIN="+Spin+" WIN="+Win);
        if(!string.IsNullOrEmpty(LastUnhandled)) sb.AppendLine("LAST_UNHANDLED="+LastUnhandled);
        try {
            if(File.Exists(LogFile)){
                var lines=File.ReadAllLines(LogFile);
                int start=Math.Max(0,lines.Length-18);
                for(int i=start;i<lines.Length;i++){
                    var line=lines[i];
                    if(line.Length>260) line=line.Substring(0,260);
                    sb.AppendLine(line);
                }
            }
        } catch(Exception ex){ sb.AppendLine("DEBUG_READ_ERROR "+ex.GetType().Name); }
        return sb.ToString();
    }
    static string ReadHeaders(NetworkStream s){ var ms=new MemoryStream(); int state=0; while(ms.Length<65536){ int b=s.ReadByte(); if(b<0)return null; ms.WriteByte((byte)b); if(state==0&&b==13)state=1; else if(state==1&&b==10)state=2; else if(state==2&&b==13)state=3; else if(state==3&&b==10)break; else state=0; } return Encoding.ASCII.GetString(ms.ToArray()); }
    static void SendFile(NetworkStream s,string f,string mime){ var b=File.ReadAllBytes(f); SendBytes(s,b,mime); }
    static void SendText(NetworkStream s,string t,string mime){ SendBytes(s,Encoding.UTF8.GetBytes(t),mime); }
    static void SendBytes(NetworkStream s,byte[] b,string mime){ var h=Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: "+mime+"\r\nContent-Length: "+b.Length+"\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"); s.Write(h,0,h.Length);s.Write(b,0,b.Length); }
    static void Send404(NetworkStream s){ var b=Encoding.ASCII.GetBytes("Not found"); var h=Encoding.ASCII.GetBytes("HTTP/1.1 404 Not Found\r\nContent-Length: "+b.Length+"\r\nConnection: close\r\n\r\n");s.Write(h,0,h.Length);s.Write(b,0,b.Length); }
    static string Mime(string f){ f=f.ToLowerInvariant(); if(f.EndsWith(".js"))return "application/javascript"; if(f.EndsWith(".json"))return "application/json"; if(f.EndsWith(".css"))return "text/css"; if(f.EndsWith(".webp"))return "image/webp"; if(f.EndsWith(".png"))return "image/png"; if(f.EndsWith(".jpg")||f.EndsWith(".jpeg"))return "image/jpeg"; if(f.EndsWith(".mp3"))return "audio/mpeg"; if(f.EndsWith(".ogg"))return "audio/ogg"; if(f.EndsWith(".woff"))return "font/woff"; if(f.EndsWith(".woff2"))return "font/woff2"; return "application/octet-stream"; }

    static void HandleWs(NetworkStream s,Dictionary<string,string> h){ string key=h.ContainsKey("Sec-WebSocket-Key")?h["Sec-WebSocket-Key"]:""; using(var sha=SHA1.Create()){ var accept=Convert.ToBase64String(sha.ComputeHash(Encoding.ASCII.GetBytes(key+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))); var proto=h.ContainsKey("Sec-WebSocket-Protocol")&&h["Sec-WebSocket-Protocol"].Contains("mux")?"Sec-WebSocket-Protocol: mux\r\n":""; var resp=Encoding.ASCII.GetBytes("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "+accept+"\r\n"+proto+"\r\n");s.Write(resp,0,resp.Length); }
        var seen=new List<int>(); bool boot=false; WsConnected=true; BootstrapSent=false; LastClientCommand=-1; LastUnhandled=""; Log("WS OPEN");
        while(true){ int op; byte[] payload; if(!ReadFrame(s,out op,out payload))break; if(op==8)break; if(op==9){WriteFrame(s,10,payload);continue;} if(op!=1||payload.Length==0)continue; var txt=Encoding.UTF8.GetString(payload); int cmd=(int)txt[0]; LastClientCommand=cmd; seen.Add(cmd); Log("CLIENT cmd="+cmd+" len="+payload.Length);
            if(!boot && seen.Count>=4 && seen[0]==33 && seen[1]==39 && (seen[2]==7 || seen[2]==12) && seen.Contains(48)){ Log("SKIN_READY cmd=48 entry="+seen[2]); SendTextFrame(s,Packet(8,"0","2.5.5","LOCAL","13275","1.10.25","LOCAL_CASH_CONNECTION")); SendTextFrame(s,Packet(7,"CURRENCY","USD","CURRENCYFACTOR","100","CLIENT_TO_WRAPPER","1","WRAPPER_TO_CLIENT","1")); SendTextFrame(s,Packet(12,"USD","$")); SendTextFrame(s,Case6(true)); boot=true; BootstrapSent=true; Log("BOOTSTRAP SENT after 48"); continue; }
            if(!boot)continue;
            if(cmd==50){
                Log("BET_MODE cmd=50 NO_REPLY");
            }
            else if(cmd==51){ lock(Sync){ if(Win==0 && !LockSpinActive){ Credit-=100; Spin++; for(int i=0;i<5;i++) Stops[i]=(Spin*7+i*13)%160; if(ForceLockSpinNext){ ForceLockSpinNext=false; StartLockSpin(); } } } SendTextFrame(s,Case6(false)); Log("SPIN "+Spin+" stops="+string.Join(",",Stops)); }
            else if(cmd==52){ lock(Sync){Credit+=Win;Win=0;} SendTextFrame(s,Case6(false)); Log("COLLECT"); }
            else if(cmd==54){ SendTextFrame(s,Case6(false)); }
            else if(cmd==71){ lock(Sync){ AdvanceLockSpin(); } SendTextFrame(s,Case6(false)); }
            else if(cmd==82){ }
            else { LastUnhandled="cmd="+cmd+" len="+payload.Length; Log("UNHANDLED cmd="+cmd); }
        } WsConnected=false; Log("WS CLOSE");
    }
    static void SendTextFrame(NetworkStream s,string text){ WriteFrame(s,1,Encoding.UTF8.GetBytes(text)); Log("SERVER cmd="+(int)text[0]+" len="+Encoding.UTF8.GetByteCount(text)); }
    static bool ReadFrame(NetworkStream s,out int op,out byte[] data){ op=0;data=null; int a=s.ReadByte(); if(a<0)return false; int b=s.ReadByte(); if(b<0)return false; op=a&15; bool mask=(b&128)!=0; ulong n=(ulong)(b&127); if(n==126){int x=s.ReadByte(),y=s.ReadByte();if(y<0)return false;n=(ulong)((x<<8)|y);} else if(n==127){n=0;for(int i=0;i<8;i++){int x=s.ReadByte();if(x<0)return false;n=(n<<8)|(byte)x;}} if(n>1048576)throw new Exception("WS frame too large"); byte[] m=mask?ReadExact(s,4):null; data=ReadExact(s,(int)n); if(mask)for(int i=0;i<data.Length;i++)data[i]=(byte)(data[i]^m[i%4]); return true; }
    static byte[] ReadExact(NetworkStream s,int n){ var b=new byte[n];int p=0;while(p<n){int r=s.Read(b,p,n-p);if(r<=0)throw new EndOfStreamException();p+=r;}return b;}
    static void WriteFrame(NetworkStream s,int op,byte[] data){ var h=new List<byte>();h.Add((byte)(0x80|op));ulong n=(ulong)data.Length;if(n<=125)h.Add((byte)n);else if(n<=65535){h.Add(126);h.Add((byte)(n>>8));h.Add((byte)n);}else{h.Add(127);for(int i=7;i>=0;i--)h.Add((byte)(n>>(8*i)));}var hb=h.ToArray();s.Write(hb,0,hb.Length);if(data.Length>0)s.Write(data,0,data.Length);s.Flush();}
}