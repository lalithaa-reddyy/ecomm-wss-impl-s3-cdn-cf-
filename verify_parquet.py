#!/usr/bin/env python3
"""
Utility script to read and analyze Parquet files from S3
Install: pip install pandas pyarrow boto3
"""

import sys
import pandas as pd
import boto3
from datetime import datetime

def read_parquet_from_s3(bucket, key):
    """Read Parquet file from S3"""
    print(f"\n📥 Reading Parquet file from S3...")
    print(f"   Bucket: {bucket}")
    print(f"   Key: {key}")
    
    s3 = boto3.client('s3')
    obj = s3.get_object(Bucket=bucket, Key=key)
    
    df = pd.read_parquet(obj['Body'])
    return df

def get_latest_parquet_files(bucket, prefix, max_files=5):
    """Get latest Parquet files from S3 folder"""
    s3 = boto3.client('s3')
    
    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
    
    if 'Contents' not in response:
        print(f"❌ No files found in s3://{bucket}/{prefix}")
        return []
    
    files = sorted(
        response['Contents'],
        key=lambda x: x['LastModified'],
        reverse=True
    )[:max_files]
    
    return [(f['Key'], f['Size'], f['LastModified']) for f in files]

def analyze_parquet_file(bucket, key):
    """Analyze Parquet file statistics"""
    print(f"\n📊 Analyzing Parquet file...")
    df = read_parquet_from_s3(bucket, key)
    
    print(f"\n✅ File Statistics:")
    print(f"   Shape: {df.shape[0]} rows × {df.shape[1]} columns")
    print(f"   Size in memory: {df.memory_usage().sum() / 1024 / 1024:.2f} MB")
    
    print(f"\n📋 Columns:")
    for col in df.columns:
        print(f"   - {col}: {df[col].dtype}")
    
    print(f"\n📈 Sample Data:")
    print(df.head())
    
    if 'revenue' in df.columns:
        print(f"\n💰 Revenue Statistics:")
        print(f"   Total: {df['revenue'].sum():,.2f}")
        print(f"   Mean: {df['revenue'].mean():,.2f}")
        print(f"   Max: {df['revenue'].max():,.2f}")
    
    if 'orders' in df.columns:
        print(f"\n📦 Order Statistics:")
        print(f"   Total Orders: {df['orders'].sum():,}")
        print(f"   Avg per record: {df['orders'].mean():.2f}")
    
    return df

def main():
    if len(sys.argv) < 3:
        print("Usage: python verify_parquet.py <bucket> <prefix> [action]")
        print("\nExamples:")
        print("  python verify_parquet.py event-stream-agg-123 aggregations/ list")
        print("  python verify_parquet.py event-stream-agg-123 aggregations/2024-12-15/ analyze")
        sys.exit(1)
    
    bucket = sys.argv[1]
    prefix = sys.argv[2]
    action = sys.argv[3] if len(sys.argv) > 3 else "list"
    
    print(f"🔍 Parquet File Utility")
    print(f"   AWS S3 Bucket: {bucket}")
    print(f"   Prefix: {prefix}")
    
    try:
        if action == "list":
            print(f"\n📂 Latest Parquet files:")
            files = get_latest_parquet_files(bucket, prefix)
            for key, size, mtime in files:
                size_mb = size / 1024 / 1024
                print(f"   📄 {key}")
                print(f"      Size: {size_mb:.2f} MB")
                print(f"      Modified: {mtime}")
            
            if files:
                latest_key = files[0][0]
                print(f"\n🔄 Analyzing latest file: {latest_key}")
                analyze_parquet_file(bucket, latest_key)
        
        elif action == "analyze" and len(sys.argv) > 3:
            # List files and analyze
            files = get_latest_parquet_files(bucket, prefix, max_files=1)
            if files:
                analyze_parquet_file(bucket, files[0][0])
        
        else:
            print("❌ Unknown action. Use 'list' or 'analyze'")
            sys.exit(1)
    
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
