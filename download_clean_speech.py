import os
import requests
import zipfile
import time
from tqdm import tqdm

def download_and_extract(url, extract_to):
    os.makedirs(extract_to, exist_ok=True)
    zip_path = os.path.join(extract_to, "temp.zip")
    
    # Check existing file size for resume
    headers = {}
    mode = 'wb'
    initial_pos = 0
    
    if os.path.exists(zip_path):
        initial_pos = os.path.getsize(zip_path)
        headers['Range'] = f'bytes={initial_pos}-'
        mode = 'ab'
        
    print(f"Downloading {url} (resuming from {initial_pos} bytes)...")
    
    max_retries = 50
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, stream=True, timeout=30)
            
            # If server doesn't support partial content (206), it will return 200 and send everything
            if response.status_code == 200 and initial_pos > 0:
                print("Server doesn't support resume. Restarting download.")
                initial_pos = 0
                mode = 'wb'
                
            total_size = int(response.headers.get('content-length', 0)) + initial_pos
            
            with open(zip_path, mode) as file, tqdm(
                desc=zip_path,
                initial=initial_pos,
                total=total_size,
                unit='iB',
                unit_scale=True,
                unit_divisor=1024,
            ) as bar:
                for data in response.iter_content(chunk_size=8192):
                    if data:
                        size = file.write(data)
                        bar.update(size)
                        
            break # Success, break out of retry loop
            
        except requests.exceptions.RequestException as e:
            print(f"\nDownload interrupted: {e}")
            if attempt < max_retries - 1:
                print(f"Retrying in 5 seconds (Attempt {attempt + 2}/{max_retries})...")
                time.sleep(5)
                # Update initial_pos for next retry
                if os.path.exists(zip_path):
                    initial_pos = os.path.getsize(zip_path)
                    headers['Range'] = f'bytes={initial_pos}-'
                    mode = 'ab'
            else:
                print("Failed to download after multiple attempts.")
                raise e

    print(f"Extracting {zip_path} to {extract_to}...")
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)
        os.remove(zip_path)
        print("Done!")
    except zipfile.BadZipFile:
        print(f"Error: {zip_path} is not a valid zip file. It might be incomplete or corrupted.")
        print("Please delete it and try again.")
        raise

if __name__ == "__main__":
    base_dir = "data/raw"
    os.makedirs(base_dir, exist_ok=True)
    
    train_url = "https://datashare.ed.ac.uk/bitstream/handle/10283/2791/clean_trainset_28spk_wav.zip"
    test_url = "https://datashare.ed.ac.uk/bitstream/handle/10283/2791/clean_testset_wav.zip"
    
    print("Starting reliable download process...")
    download_and_extract(train_url, base_dir)
    download_and_extract(test_url, base_dir)
