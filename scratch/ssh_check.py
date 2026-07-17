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
        
        commands = [
            "ls -la /var/www/WeldSnap/node_modules/pino-roll || echo 'pino-roll not found'",
            "ls -la /var/www/WeldSnap/node_modules/pino-pretty || echo 'pino-pretty not found'"
        ]
        
        for cmd in commands:
            print(f"\n=== Running '{cmd}' ===")
            stdin, stdout, stderr = ssh.exec_command(cmd)
            print(stdout.read().decode('utf-8', errors='ignore'))
                
    except Exception as e:
        print("Error:", e)
    finally:
        ssh.close()

if __name__ == "__main__":
    main()
