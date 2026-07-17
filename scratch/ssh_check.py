import paramiko
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
        
        # Check pm2 list
        stdin, stdout, stderr = ssh.exec_command("pm2 ls")
        print("\n=== PM2 List ===")
        print(stdout.read().decode('utf-8', errors='ignore'))

        # Check PM2 error logs for WeldSnap
        stdin, stdout, stderr = ssh.exec_command("tail -n 100 ~/.pm2/logs/WeldSnap-error.log")
        print("\n=== PM2 Error Logs ===")
        print(stdout.read().decode('utf-8', errors='ignore'))
        
        # Check PM2 output logs for WeldSnap
        stdin, stdout, stderr = ssh.exec_command("tail -n 100 ~/.pm2/logs/WeldSnap-out.log")
        print("\n=== PM2 Out Logs ===")
        print(stdout.read().decode('utf-8', errors='ignore'))
                
    except Exception as e:
        print("Error:", e)
    finally:
        ssh.close()

if __name__ == "__main__":
    main()
