#!/usr/bin/env python3
"""
地图配置合并工具：将生成的地图网格与原有配置合并
"""

import json
import os


def merge_maps(generated_path, original_path, output_path):
    """
    合并生成的地图数据与原有配置
    :param generated_path: 生成的地图数据路径
    :param original_path: 原有地图配置路径（备份）
    :param output_path: 输出路径
    """
    # 加载生成的地图数据
    with open(generated_path, 'r', encoding='utf-8') as f:
        generated = json.load(f)
    
    # 加载原有地图配置（如果存在）
    if os.path.exists(original_path):
        with open(original_path, 'r', encoding='utf-8') as f:
            original = json.load(f)
        print(f"已加载原有配置: {original_path}")
    else:
        original = {}
        print(f"原有配置不存在，使用默认值")
    
    # 合并配置：保留原有配置，只更新网格和地形类型
    merged = {
        # 基础参数
        'gridWidth': generated['gridWidth'],
        'gridHeight': generated['gridHeight'],
        'tileSize': original.get('tileSize', 60),
        'viewportCols': original.get('viewportCols', 53),
        'viewportRows': original.get('viewportRows', 26),
        
        # 地形类型（使用生成的，更新颜色值）
        'groundTypes': generated['groundTypes'],
        
        # 网格数据（使用生成的）
        'grid': generated['grid'],
        
        # 探险入口（保留原有）
        'expeditionEntrances': original.get('expeditionEntrances', []),
        
        # 初始建筑（保留原有）
        'initialBuildings': original.get('initialBuildings', []),
        
        # 视角中心（保留原有或使用生成的）
        'viewportCenter': original.get('viewportCenter', generated.get('viewportCenter', {
            'defaultGridX': generated['gridWidth'] // 2,
            'defaultGridY': generated['gridHeight'] // 2,
            'useLastSavedPosition': True
        })),
        
        # 初始相机（兼容旧配置）
        'initialCamera': original.get('initialCamera', None)
    }
    
    # 移除 None 值
    if merged['initialCamera'] is None:
        del merged['initialCamera']
    
    # 保存合并后的配置
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    
    print(f"合并完成！已保存到: {output_path}")
    print()
    print("合并详情：")
    print(f"  地图尺寸: {merged['gridWidth']} × {merged['gridHeight']}")
    print(f"  探险入口: {len(merged['expeditionEntrances'])} 个")
    print(f"  初始建筑: {len(merged['initialBuildings'])} 个")
    print(f"  地形类型: {len(merged['groundTypes'])} 种")
    
    return merged


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # 路径
    generated_path = os.path.join(base_dir, 'config', 'maps', 'generated_map.json')
    original_path = os.path.join(base_dir, 'config', 'maps', 'base_map.json.backup')
    output_path = os.path.join(base_dir, 'config', 'maps', 'base_map.json')
    
    # 如果原文件存在，先备份
    if os.path.exists(output_path):
        import shutil
        shutil.copy2(output_path, original_path)
        print(f"已备份原配置到: {original_path}")
    
    if not os.path.exists(generated_path):
        print(f"错误：生成的地图数据不存在: {generated_path}")
        return
    
    merge_maps(generated_path, original_path, output_path)


if __name__ == '__main__':
    main()
