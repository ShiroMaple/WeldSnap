# V1 历史诊断脚本：仅供迁移追溯，不能作为当前部署命令。`r`nimport paramiko
import time
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def main():
    host = "192.168.103.191"
    user = "zpje"
    password = "1234"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(host, username=user, password=password, timeout=10)
        print("Connected successfully!")
        
        # 1. Start the server on port 4005 using exec_command (this will block, so we read it asynchronously)
        print("Starting node server on port 4005 using /opt/node-v22/bin/node...")
        transport = ssh.get_transport()
        channel = transport.open_session()
        channel.exec_command("cd /var/www/WeldSnap && PORT=4005 /opt/node-v22/bin/node --experimental-sqlite --env-file=.env.local server.js")
        
        time.sleep(4) # Wait for server to start
        
        # 2. Open a separate SSH connection to send a curl request
        print("Sending curl login request...")
        curl_ssh = paramiko.SSHClient()
        curl_ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        curl_ssh.connect(host, username=user, password=password, timeout=10)
        
        curl_cmd = "curl -i -d '{\"username\":\"admin\",\"password\":\"admin123\"}' -H \"Content-Type: application/json\" http://localhost:4005/api/auth/login"
        stdin, stdout, stderr = curl_ssh.exec_command(curl_cmd)
        
        print("\n--- Curl Response ---")
        print(stdout.read().decode('utf-8', errors='ignore'))
        print("Stderr:", stderr.read().decode('utf-8', errors='ignore'))
        curl_ssh.close()
        
        # 3. Read output from the node server channel (which should contain the crash log!)
        print("\n--- Node Server Console Output ---")
        time.sleep(2)
        if channel.recv_ready():
            print(channel.recv(10240).decode('utf-8', errors='ignore'))
        if channel.recv_stderr_ready():
            print("Stderr output:")
            print(channel.recv_stderr(10240).decode('utf-8', errors='ignore'))
            
        channel.close()
                
    except Exception as e:
        print("Error:", e)
    finally:
        ssh.close()

if __name__ == "__main__":
    main()
