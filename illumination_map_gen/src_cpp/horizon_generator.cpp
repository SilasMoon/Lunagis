#include <iostream>
#include <vector>
#include <cmath>
#include <algorithm>
#include <omp.h>
#include <fstream>
#include <atomic>
#include <iomanip>
#include <string>
#include <map>

// CONFIGURATION DEFAULTS
const int AZIMUTH_STEPS = 360;    
const float MAX_RAY_DIST_M = 50000.0; 

struct TerrainMap {
    std::vector<float> data;
    int width, height;
    float observer_height;
    float pixel_scale;

    // Bilinear Interpolation
    float get_bilinear(float x, float y) const {
        int x0 = (int)floor(x);
        int y0 = (int)floor(y);
        int x1 = x0 + 1;
        int y1 = y0 + 1;

        if (x0 < 0 || x1 >= width || y0 < 0 || y1 >= height) return -99999.0f;

        float sx = x - x0;
        float sy = y - y0;

        float h00 = data[y0 * width + x0];
        float h10 = data[y0 * width + x1];
        float h01 = data[y1 * width + x0];
        float h11 = data[y1 * width + x1];

        if (h00 < -50000 || h10 < -50000 || h01 < -50000 || h11 < -50000) 
            return data[(int)round(y) * width + (int)round(x)];

        float h0 = h00 * (1 - sx) + h10 * sx;
        float h1 = h01 * (1 - sx) + h11 * sx;
        return h0 * (1 - sy) + h1 * sy;
    }
};

struct RayResult {
    float angle;
    float distance;
};

RayResult cast_ray(const TerrainMap& dem, int px, int py, float azimuth_rad) {
    float start_h = dem.get_bilinear((float)px, (float)py) + dem.observer_height;
    
    float dx = cos(azimuth_rad);
    float dy = sin(azimuth_rad);
    
    float max_angle = -90.0f;
    float horizon_dist = 0.0f;
    
    float current_dist_m = 0.0f;
    float step_size_m = dem.pixel_scale; 
    
    float cur_x = px;
    float cur_y = py;
    int max_steps = (int)(MAX_RAY_DIST_M / step_size_m);
    
    for (int step = 1; step < max_steps; ++step) {
        cur_x += dx;
        cur_y += dy;
        current_dist_m += step_size_m;
        
        float target_h = dem.get_bilinear(cur_x, cur_y);
        if (target_h < -50000.0f) break; 

        float curvature_drop = (current_dist_m * current_dist_m) / (2 * 1737400.0f);
        float adjusted_height_diff = (target_h - curvature_drop) - start_h;
        float angle = atan2(adjusted_height_diff, current_dist_m);
        
        if (angle > max_angle) {
            max_angle = angle;
            horizon_dist = current_dist_m;
        }
    }
    // Return both angle and the distance where that angle was found
    return { max_angle * (180.0f / 3.14159265f), horizon_dist };
}

std::map<std::string, float> load_config(std::string filepath) {
    std::map<std::string, float> config;
    std::ifstream file(filepath);
    std::string line;
    while (std::getline(file, line)) {
        size_t delimiter = line.find('=');
        if (delimiter != std::string::npos) {
            std::string key = line.substr(0, delimiter);
            std::string val = line.substr(delimiter + 1);
            config[key] = std::stof(val);
        }
    }
    return config;
}

int main() {
    std::cout << "Reading output_data/horizon_config.txt..." << std::endl;
    auto cfg = load_config("output_data/horizon_config.txt");
    
    if (cfg.find("WIDTH") == cfg.end()) {
        std::cerr << "Error: Invalid config file (WIDTH missing)." << std::endl;
        return 1;
    }

    int width = (int)cfg["WIDTH"];
    int height = (int)cfg["HEIGHT"];
    float obs_h = cfg["OBSERVER_HEIGHT"];
    float pixel_scale = cfg["PIXEL_SCALE"];

    std::cout << "Grid: " << width << "x" << height 
              << " | Scale: " << pixel_scale << "m/px" 
              << " | Obs Height: " << obs_h << "m" << std::endl;

    TerrainMap dem;
    dem.width = width;
    dem.height = height;
    dem.observer_height = obs_h;
    dem.pixel_scale = pixel_scale;
    dem.data.resize(width * height);

    std::ifstream infile("output_data/terrain_input.bin", std::ios::binary);
    infile.read(reinterpret_cast<char*>(dem.data.data()), dem.data.size() * sizeof(float));

    long total_pixels = (long)width * height;
    long total_elements = total_pixels * AZIMUTH_STEPS;
    
    // Output Buffers
    std::vector<short> horizon_angles(total_elements);
    std::vector<unsigned short> horizon_dists(total_elements); // Store meters (max 65535m)

    std::cout << "Starting Processing..." << std::endl;
    std::atomic<long> processed_count(0);
    double start_time = omp_get_wtime();

    #pragma omp parallel for collapse(2) schedule(dynamic)
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            for (int az = 0; az < AZIMUTH_STEPS; ++az) {
                float azimuth_rad = az * (3.14159265f / 180.0f);
                
                RayResult res = cast_ray(dem, x, y, azimuth_rad);
                
                long idx = ((long)y * width + x) * AZIMUTH_STEPS + az;
                
                // Save Angle (Scaled by 100)
                horizon_angles[idx] = (short)(res.angle * 100);
                // Save Distance (Meters, fits in unsigned short)
                horizon_dists[idx] = (unsigned short)(res.distance);
            }
            
            long current = ++processed_count;
            if (current % (total_pixels / 100) == 0) {
                #pragma omp critical
                {
                    double elapsed = omp_get_wtime() - start_time;
                    double rate = current / elapsed;
                    double rem = (total_pixels - current) / rate;
                    std::cout << "Progress: " << (int)(100.0*current/total_pixels) << "% "
                              << "[ETA: " << (int)(rem/60) << "m " << (int)((long)rem%60) << "s] \r" << std::flush;
                }
            }
        }
    }

    std::cout << "\nSaving Horizon Angles -> output_data/horizon_mask.bin..." << std::endl;
    std::ofstream outfile("output_data/horizon_mask.bin", std::ios::binary);
    outfile.write(reinterpret_cast<const char*>(horizon_angles.data()), horizon_angles.size() * sizeof(short));
    
    std::cout << "Saving Horizon Distances -> output_data/horizon_distances.bin..." << std::endl;
    std::ofstream outfile_dist("output_data/horizon_distances.bin", std::ios::binary);
    outfile_dist.write(reinterpret_cast<const char*>(horizon_dists.data()), horizon_dists.size() * sizeof(unsigned short));

    std::cout << "Done." << std::endl;
    return 0;
}