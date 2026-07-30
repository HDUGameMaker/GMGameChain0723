#!/usr/bin/env python3
"""
地图生成工具：从地图图片生成游戏可用的地图数据
通过计算每个像素与地形类型颜色的相似度来确定地形
"""

from PIL import Image
import json
import os
import sys

# 当前支持的地形类型及其参考颜色
# 根据实际地图图片分析调整颜色值
TERRAIN_TYPES = {
    'R': {
        'name': '裸露石头',
        'buildable': 'restricted',
        'colorHint': '#dedede',
        'rgb': (222, 222, 222)
    },
    'G': {
        'name': '草地',
        'buildable': True,
        'colorHint': '#7BA05B',
        'rgb': (123, 160, 91)
    },
    'D': {
        'name': '普通土地',
        'buildable': True,
        'colorHint': '#B89B5A',
        'rgb': (184, 155, 90)
    },
    'F': {
        'name': '林地边缘',
        'buildable': True,
        'colorHint': '#2D5A1E',
        'rgb': (45, 90, 30)
    },
    'M': {
        'name': '山脉',
        'buildable': False,
        'colorHint': '#282828',
        'rgb': (40, 40, 40)
    },
    'W': {
        'name': '水源',
        'buildable': 'restricted',
        'colorHint': '#4682B4',
        'rgb': (70, 130, 180)
    },
    'B': {
        'name': '屏障',
        'buildable': False,
        'colorHint': '#141414',
        'rgb': (20, 20, 20)
    }
}


def hex_to_rgb(hex_color):
    """将十六进制颜色转换为 RGB 元组"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    """将 RGB 元组转换为十六进制颜色"""
    return '#{:02x}{:02x}{:02x}'.format(*rgb)


def color_distance(c1, c2):
    """计算两个颜色之间的欧几里得距离（RGB空间）"""
    r1, g1, b1 = c1
    r2, g2, b2 = c2
    return ((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) ** 0.5


def color_distance_weighted(c1, c2):
    """
    加权颜色距离（考虑人眼对不同颜色通道的敏感度）
    使用 YCbCr 或近似的加权公式
    """
    r1, g1, b1 = c1
    r2, g2, b2 = c2
    
    # 简单加权：绿色对人眼更重要
    dr = (r1 - r2) * 0.3
    dg = (g1 - g2) * 0.59
    db = (b1 - b2) * 0.11
    
    return (dr ** 2 + dg ** 2 + db ** 2) ** 0.5


def get_closest_terrain(pixel_rgb, terrain_types, method='weighted'):
    """
    找到与给定像素颜色最接近的地形类型
    :param pixel_rgb: 像素的 RGB 颜色元组
    :param terrain_types: 地形类型字典
    :param method: 'simple' 或 'weighted' 距离计算方法
    :return: 地形类型代码（如 'G', 'D' 等）
    """
    min_distance = float('inf')
    closest_code = 'B'  # 默认屏障
    
    for code, terrain in terrain_types.items():
        terrain_rgb = terrain['rgb']
        if method == 'weighted':
            dist = color_distance_weighted(pixel_rgb, terrain_rgb)
        else:
            dist = color_distance(pixel_rgb, terrain_rgb)
        
        if dist < min_distance:
            min_distance = dist
            closest_code = code
    
    return closest_code


def analyze_image_colors(image_path, sample_count=100):
    """
    分析图片中的颜色分布，帮助确定地形颜色阈值
    """
    img = Image.open(image_path)
    pixels = img.load()
    width, height = img.size
    
    color_counts = {}
    
    # 随机采样像素
    import random
    for _ in range(sample_count):
        x = random.randint(0, width - 1)
        y = random.randint(0, height - 1)
        rgb = pixels[x, y]
        hex_color = rgb_to_hex(rgb)
        color_counts[hex_color] = color_counts.get(hex_color, 0) + 1
    
    # 按出现频率排序
    sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)
    
    print("图片颜色分布分析（采样 {} 个像素）：".format(sample_count))
    print("-" * 60)
    for hex_color, count in sorted_colors[:20]:
        rgb = hex_to_rgb(hex_color)
        print("{}  {}  出现 {} 次".format(hex_color, rgb, count))
    print("-" * 60)
    
    return sorted_colors


def generate_map_grid(image_path, terrain_types, method='weighted', downscale=1):
    """
    从图片生成地图网格数据
    :param image_path: 地图图片路径
    :param terrain_types: 地形类型字典
    :param method: 颜色匹配方法
    :param downscale: 缩小倍数（用于将大图片缩小为网格）
    :return: 地图网格列表（每行一个字符串）
    """
    img = Image.open(image_path)
    
    # 如果需要缩小图片
    if downscale > 1:
        new_size = (img.width // downscale, img.height // downscale)
        img = img.resize(new_size, Image.Resampling.LANCZOS)
    
    pixels = img.load()
    width, height = img.size
    
    grid = []
    
    for y in range(height):
        row = []
        for x in range(width):
            rgb = pixels[x, y]
            # 如果是 RGBA 模式，忽略 alpha 通道
            if len(rgb) == 4:
                rgb = rgb[:3]
            terrain_code = get_closest_terrain(rgb, terrain_types, method)
            row.append(terrain_code)
        grid.append(''.join(row))
    
    return grid


def generate_map_json(image_path, output_path=None, terrain_types=None, 
                      tile_size=60, downscale=1, method='weighted'):
    """
    生成完整的地图 JSON 配置文件
    """
    if terrain_types is None:
        terrain_types = TERRAIN_TYPES
    
    grid = generate_map_grid(image_path, terrain_types, method, downscale)
    
    width = len(grid[0]) if grid else 0
    height = len(grid)
    
    # 构建 groundTypes（不含 rgb 字段，因为游戏不需要）
    ground_types = {}
    for code, terrain in terrain_types.items():
        ground_types[code] = {
            'name': terrain['name'],
            'buildable': terrain['buildable'],
            'colorHint': terrain['colorHint']
        }
    
    map_data = {
        'gridWidth': width,
        'gridHeight': height,
        'tileSize': tile_size,
        'groundTypes': ground_types,
        'grid': grid,
        'expeditionEntrances': [],
        'initialBuildings': [],
        'viewportCenter': {
            'defaultGridX': width // 2,
            'defaultGridY': height // 2,
            'useLastSavedPosition': True
        }
    }
    
    if output_path is None:
        # 默认输出到 config/maps 目录
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(image_path)))
        output_path = os.path.join(base_dir, 'config', 'maps', 'generated_map.json')
    
    # 确保输出目录存在
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(map_data, f, ensure_ascii=False, indent=2)
    
    print(f"地图数据已生成并保存到: {output_path}")
    print(f"地图尺寸: {width} × {height}")
    
    # 统计地形分布
    terrain_counts = {}
    for row in grid:
        for code in row:
            terrain_counts[code] = terrain_counts.get(code, 0) + 1
    
    print("\n地形分布统计：")
    print("-" * 60)
    for code, count in sorted(terrain_counts.items(), key=lambda x: x[1], reverse=True):
        terrain = terrain_types.get(code, {'name': '未知'})
        percentage = (count / (width * height)) * 100
        print(f"  {code} ({terrain['name']}): {count} 格 ({percentage:.1f}%)")
    print("-" * 60)
    
    return map_data


def interactive_color_picker(image_path):
    """
    交互式颜色选择器：点击图片获取颜色值
    需要安装 matplotlib
    """
    try:
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        print("需要安装 matplotlib 才能使用交互式颜色选择器")
        print("请运行: pip install matplotlib")
        return
    
    img = Image.open(image_path)
    img_array = np.array(img)
    
    fig, ax = plt.subplots(figsize=(10, 10))
    ax.imshow(img_array)
    ax.set_title("点击图片获取颜色值（关闭窗口退出）")
    
    def onclick(event):
        if event.xdata is None or event.ydata is None:
            return
        
        x = int(event.xdata)
        y = int(event.ydata)
        
        if x < 0 or x >= img.width or y < 0 or y >= img.height:
            return
        
        rgb = img_array[y, x]
        if len(rgb) == 4:
            rgb = rgb[:3]
        
        hex_color = rgb_to_hex(rgb)
        print(f"坐标 ({x}, {y}): RGB={rgb}, HEX={hex_color}")
        
        # 显示与各地形的距离
        print("  与各地形的距离：")
        for code, terrain in TERRAIN_TYPES.items():
            dist = color_distance(rgb, terrain['rgb'])
            print(f"    {code} ({terrain['name']}): {dist:.2f}")
        print()
    
    fig.canvas.mpl_connect('button_press_event', onclick)
    plt.show()


def main():
    print("=" * 60)
    print("地图生成工具 - 从图片生成游戏地图数据")
    print("=" * 60)
    print()
    
    # 默认路径
    default_image_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'assets', 'map', 'map.png'
    )
    
    # 解析命令行参数
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
    else:
        image_path = default_image_path
    
    if not os.path.exists(image_path):
        print(f"错误：图片文件不存在: {image_path}")
        print(f"默认路径: {default_image_path}")
        return
    
    print(f"地图图片: {image_path}")
    img = Image.open(image_path)
    print(f"图片尺寸: {img.width} × {img.height}")
    print(f"图片模式: {img.mode}")
    print()
    
    # 分析颜色分布
    print("正在分析图片颜色分布...")
    analyze_image_colors(image_path, sample_count=200)
    print()
    
    # 生成地图数据
    print("正在生成地图数据...")
    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'config', 'maps', 'generated_map.json'
    )
    
    generate_map_json(
        image_path=image_path,
        output_path=output_path,
        terrain_types=TERRAIN_TYPES,
        tile_size=60,
        downscale=1,
        method='weighted'
    )
    
    print()
    print("生成完成！")
    print()
    print("提示：")
    print("1. 生成的地图数据保存在 config/maps/generated_map.json")
    print("2. 如果需要调整地形颜色，可以修改脚本中的 TERRAIN_TYPES")
    print("3. 使用 --interactive 参数启动交互式颜色选择器")
    print("4. 修改 downscale 参数可以将大图片缩小为网格")


if __name__ == '__main__':
    if '--interactive' in sys.argv:
        default_image_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'assets', 'map', 'map.png'
        )
        image_path = sys.argv[1] if len(sys.argv) > 2 else default_image_path
        interactive_color_picker(image_path)
    else:
        main()
