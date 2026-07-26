#!/usr/bin/env python3
"""
地图生成验证工具：将生成的地图数据渲染回图片，与原图对比
"""

from PIL import Image
import json
import os

# 地形类型定义（与生成脚本保持一致）
TERRAIN_TYPES = {
    'R': {'name': '裸露石头', 'rgb': (222, 222, 222)},
    'G': {'name': '草地', 'rgb': (123, 160, 91)},
    'D': {'name': '普通土地', 'rgb': (184, 155, 90)},
    'F': {'name': '林地边缘', 'rgb': (45, 90, 30)},
    'M': {'name': '山脉', 'rgb': (40, 40, 40)},
    'W': {'name': '水源', 'rgb': (70, 130, 180)},
    'B': {'name': '屏障', 'rgb': (20, 20, 20)}
}


def render_map_to_image(map_data, output_path, pixel_size=4):
    """
    将地图数据渲染为图片
    :param map_data: 地图数据字典
    :param output_path: 输出图片路径
    :param pixel_size: 每个格子的像素大小（放大倍数）
    """
    grid = map_data['grid']
    width = map_data['gridWidth']
    height = map_data['gridHeight']
    
    # 创建放大后的图片
    img_width = width * pixel_size
    img_height = height * pixel_size
    
    img = Image.new('RGB', (img_width, img_height))
    pixels = img.load()
    
    for row in range(height):
        for col in range(width):
            terrain_code = grid[row][col]
            rgb = TERRAIN_TYPES.get(terrain_code, TERRAIN_TYPES['B'])['rgb']
            
            # 填充放大后的像素块
            for py in range(pixel_size):
                for px in range(pixel_size):
                    pixels[col * pixel_size + px, row * pixel_size + py] = rgb
    
    img.save(output_path)
    print(f"地图渲染图片已保存到: {output_path}")
    return img


def compare_maps(original_image_path, generated_map_path):
    """
    对比原图和生成的地图数据
    """
    # 加载原图
    original_img = Image.open(original_image_path)
    original_pixels = original_img.load()
    orig_width, orig_height = original_img.size
    
    # 加载生成的地图数据
    with open(generated_map_path, 'r', encoding='utf-8') as f:
        map_data = json.load(f)
    
    grid = map_data['grid']
    gen_width = map_data['gridWidth']
    gen_height = map_data['gridHeight']
    
    print("=" * 60)
    print("地图对比分析")
    print("=" * 60)
    print(f"原图尺寸: {orig_width} × {orig_height}")
    print(f"生成地图尺寸: {gen_width} × {gen_height}")
    print()
    
    # 统计匹配情况
    match_count = 0
    mismatch_count = 0
    mismatch_details = {}
    
    for row in range(min(orig_height, gen_height)):
        for col in range(min(orig_width, gen_width)):
            original_rgb = original_pixels[col, row]
            if len(original_rgb) == 4:
                original_rgb = original_rgb[:3]
            
            terrain_code = grid[row][col]
            terrain_rgb = TERRAIN_TYPES.get(terrain_code, TERRAIN_TYPES['B'])['rgb']
            
            # 计算差异
            diff = sum(abs(a - b) for a, b in zip(original_rgb, terrain_rgb))
            
            if diff == 0:
                match_count += 1
            else:
                mismatch_count += 1
                # 记录差异详情
                key = (original_rgb, terrain_code)
                mismatch_details[key] = mismatch_details.get(key, 0) + 1
    
    total = match_count + mismatch_count
    match_percent = (match_count / total) * 100
    mismatch_percent = (mismatch_count / total) * 100
    
    print("匹配统计：")
    print(f"  完全匹配: {match_count} 像素 ({match_percent:.2f}%)")
    print(f"  存在差异: {mismatch_count} 像素 ({mismatch_percent:.2f}%)")
    print()
    
    # 显示差异详情（前10个）
    if mismatch_details:
        print("差异详情（前10种颜色差异）：")
        print("-" * 60)
        sorted_details = sorted(mismatch_details.items(), key=lambda x: x[1], reverse=True)[:10]
        for (orig_rgb, terrain_code), count in sorted_details:
            terrain = TERRAIN_TYPES.get(terrain_code, {'name': '未知'})
            terrain_rgb = TERRAIN_TYPES.get(terrain_code, {'rgb': (0,0,0)})['rgb']
            print(f"  原图颜色 {orig_rgb} → 被识别为 {terrain_code}({terrain['name']}) {terrain_rgb}")
            print(f"    出现次数: {count}")
        print("-" * 60)
    
    return map_data


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # 路径
    original_image_path = os.path.join(base_dir, 'assets', 'map', 'map.png')
    generated_map_path = os.path.join(base_dir, 'config', 'maps', 'generated_map.json')
    output_image_path = os.path.join(base_dir, 'assets', 'map', 'generated_map_preview.png')
    
    if not os.path.exists(original_image_path):
        print(f"错误：原图不存在: {original_image_path}")
        return
    
    if not os.path.exists(generated_map_path):
        print(f"错误：生成的地图数据不存在: {generated_map_path}")
        return
    
    # 对比分析
    map_data = compare_maps(original_image_path, generated_map_path)
    
    # 渲染生成的地图为图片
    render_map_to_image(map_data, output_image_path, pixel_size=4)
    
    print()
    print("验证完成！")
    print(f"原图路径: {original_image_path}")
    print(f"渲染预览: {output_image_path}")
    print()
    print("提示：")
    print("1. 打开 generated_map_preview.png 查看生成的地图效果")
    print("2. 如果颜色匹配不准确，可以调整脚本中的 TERRAIN_TYPES 颜色值")
    print("3. 使用 --interactive 参数启动交互式颜色选择器获取准确颜色")


if __name__ == '__main__':
    main()
