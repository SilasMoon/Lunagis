import os
import urllib.request

# CONFIGURATION
KERNEL_DIR = "input_data"
NAIF_BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"

# We switch to the DE421 pair because they are publicly guaranteed
KERNELS = {
    "naif0012.tls":             f"{NAIF_BASE}/lsk/naif0012.tls",
    "de440.bsp":                f"{NAIF_BASE}/spk/planets/de440.bsp",
    "pck00010.tpc":             f"{NAIF_BASE}/pck/pck00010.tpc",
    # The Stable Pair (DE421 Binary + Standard Frame)
    "moon_pa_de421_1900-2050.bpc": f"{NAIF_BASE}/pck/moon_pa_de421_1900-2050.bpc",
    "moon_080317.tf":           f"{NAIF_BASE}/fk/satellites/moon_080317.tf"
}

def download_kernels():
    if not os.path.exists(KERNEL_DIR):
        os.makedirs(KERNEL_DIR)

    print("--- Verifying SPICE Kernels (Stable DE421 Set) ---")
    
    for filename, url in KERNELS.items():
        filepath = os.path.join(KERNEL_DIR, filename)
        
        # 1. Cleanup corrupt/mismatched files
        if os.path.exists(filepath):
            size = os.path.getsize(filepath)
            if size < 1000: # Suspiciously small (likely 404 html)
                print(f"[!] {filename} looks corrupt. Deleting...")
                os.remove(filepath)
            else:
                with open(filepath, 'rb') as f:
                    header = f.read(15)
                    if b"<!DOCTYPE html>" in header or b"<html" in header:
                         print(f"[!] {filename} is HTML (download error). Deleting...")
                         os.remove(filepath)

        # 2. Download if missing
        if not os.path.exists(filepath):
            print(f"Downloading {filename}...")
            try:
                urllib.request.urlretrieve(url, filepath)
                print(f"   -> Saved to {filepath}")
            except Exception as e:
                print(f"   [ERROR] Failed to download {filename}: {e}")
        else:
            print(f"   [OK] {filename} present.")
            
    # Cleanup the old incompatible DE440 file if it exists to avoid confusion
    old_file = os.path.join(KERNEL_DIR, "moon_pa_de440_200625.bpc")
    if os.path.exists(old_file):
        print(f"   [CLEANUP] Removing unused/incompatible kernel: {old_file}")
        os.remove(old_file)

    print("\n--- Kernel Setup Complete ---")

if __name__ == "__main__":
    download_kernels()
