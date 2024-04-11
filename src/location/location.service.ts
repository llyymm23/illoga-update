import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './entities/location.entity';
import { User } from 'src/user/entities/user.entity';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Area } from './entities/area.entity';
import { TourSpot } from './entities/tour-spot.entity';
import * as fs from 'fs';
import * as path from 'path';
import { PuppeteerService } from 'src/utils/puppeteer.service';
import { TourSpotTag } from './entities/tour-spot-tag.entity';
import { Tag } from './entities/tag.entity';
@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
    @InjectRepository(TourSpot)
    private readonly tourSpotRepository: Repository<TourSpot>,
    @InjectRepository(TourSpotTag)
    private readonly tourSpotTagRepository: Repository<TourSpotTag>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    private readonly configService: ConfigService,
    private readonly puppeteerService: PuppeteerService,
  ) {}
  // 사용자 위치 정보 업데이트
  async updateLocation(
    user: User,
    locationData: { latitude: number; longitude: number },
  ) {
    const { latitude, longitude } = locationData;
    try {
      const response = await axios.get(
        `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${longitude}&y=${latitude}`,
        {
          headers: {
            Authorization: `KakaoAK ${this.configService.get('KAKAO_API_KEY')}`,
          },
        },
      );

      const { address, road_address } = response.data.documents[0];
      const addressInfo = address || road_address;

      let userLocation = await this.locationRepository.findOne({
        where: { userId: user.id },
      });
      if (!userLocation) {
        userLocation = this.locationRepository.create({
          userId: user.id,
          latitude: latitude,
          longitude: longitude,
          address_name: addressInfo.address_name,
          region_1depth_name: addressInfo.region_1depth_name,
          region_2depth_name: addressInfo.region_2depth_name,
          region_3depth_name: addressInfo.region_3depth_name,
        });
        await this.locationRepository.save(userLocation);
        user.location = userLocation;
        await this.userRepository.save(user);
      } else {
        userLocation.latitude = latitude;
        userLocation.longitude = longitude;
        userLocation.address_name = addressInfo.address_name;
        userLocation.region_1depth_name = addressInfo.region_1depth_name;
        userLocation.region_2depth_name = addressInfo.region_2depth_name;
        userLocation.region_3depth_name = addressInfo.region_3depth_name;

        await this.locationRepository.save(userLocation);
        user.location = userLocation;
        await this.userRepository.save(user);

        return {
          latitude,
          longitude,
          address_name: addressInfo.address_name,
          message: '사용자 위치정보가 적용되었습니다.',
        };
      }
    } catch (error) {
      console.error('Error updating location:', error);
      return { message: '사용자 위치정보를 업데이트하는데 실패했습니다.' };
    }
  }

  async addArea() {
    try {
      const areaData = await fs.promises.readFile(
        './src/location/data/area-data.json',
        'utf-8',
      );
      const parsedAreaData = JSON.parse(areaData);
      for (const data of parsedAreaData) {
        const existingArea = await this.areaRepository.findOne({
          where: { areaCode: data.areaCode },
        });
        if (!existingArea) {
          const area = this.areaRepository.create(data);
          await this.areaRepository.save(area);
        }
      }
      return { message: '데이터 추가 성공' };
    } catch (error) {
      throw new Error('데이터 추가 실패');
    }
  }

  async addTourSpot() {
    try {
      const files = await fs.promises.readdir('./src/location/data/');
      for (const file of files) {
        if (file.startsWith('areaBasedList') && file.endsWith('.json')) {
          const filePath = path.join('./src/location/data/', file);
          const tourSpotData = await fs.promises.readFile(filePath, 'utf-8');
          const parsedTourSpotData = JSON.parse(tourSpotData);
          const tourSpotItems = parsedTourSpotData.response.body.items.item;
          for (const item of tourSpotItems) {
            const existingTourSpot = await this.tourSpotRepository.findOne({
              where: { contentId: item.contentid },
            });
            if (!existingTourSpot) {
              const tourSpot = this.tourSpotRepository.create({
                addr1: item.addr1,
                addr2: item.addr2,
                areaCode: item.areacode,
                bookTour: item.booktour,
                cat1: item.cat1,
                cat2: item.cat2,
                cat3: item.cat3,
                contentId: item.contentid,
                contentTypeId: item.contenttypeid,
                createdTime: item.createdtime,
                firstImage: item.firstimage,
                firstImage2: item.firstimage2,
                cpyrhtDivCd: item.cpyrhtDivCd,
                mapX: item.mapx,
                mapY: item.mapy,
                mlevel: item.mlevel,
                modifiedTime: item.modifiedtime,
                sigunguCode: item.sigungucode,
                tel: item.tel,
                title: item.title,
                zipCode: item.zipcode,
              });
              await this.tourSpotRepository.save(tourSpot);
            }
          }
        }
      }
      return { message: '데이터 추가 성공' };
    } catch (error) {
      throw new Error('데이터 추가 실패');
    }
  }

  async findAllTourSpot() {
    const tourSpots = await this.tourSpotRepository.find({
      relations: ['tourSpotTags', 'tourSpotTags.tag'],
    });
    return tourSpots.map((tourSpot) => ({
      ...tourSpot,
      tourSpotTags: tourSpot.tourSpotTags.map(
        (tourSpotTag) => tourSpotTag.tag.name,
      ),
    }));
  }

  // 여행지 원본 조회
  async searchTourSpot(areaCode: string) {
    try {
      const tourSpots = await this.tourSpotRepository.find({
        where: { areaCode: areaCode },
      });
      return tourSpots;
    } catch (error) {
      throw new Error('여행지 검색에 실패했습니다.');
    }
  }

  // 여행지 검색
  async searchTourSpotByKeyword(keyword: string) {
    try {
      const tourSpots = await this.tourSpotRepository
        .createQueryBuilder('tourSpot')
        .leftJoinAndSelect('tourSpot.tourSpotTags', 'tourSpotTags')
        .leftJoinAndSelect('tourSpotTags.tag', 'tag')
        .addSelect(['tourSpot.title', 'tag.name'])
        .where('tourSpot.title LIKE :keyword', { keyword: `%${keyword}%` })
        .orWhere('tag.name LIKE :keyword', { keyword: `%${keyword}%` })
        .getMany();

      const tourSpotsWithTags = tourSpots.map((tourSpot) => {
        const { tourSpotTags, ...tourSpotWithoutTags } = tourSpot;
        return {
          ...tourSpotWithoutTags,
          tagNames: tourSpotTags.map((tourSpotTag) => tourSpotTag.tag.name),
        };
      });

      return tourSpotsWithTags;
    } catch (error) {
      throw new Error('여행지를 찾을수 없습니다.');
    }
  }

  // 여행지에 태그 스크롤링해서 넣기
  async searchTourSpotByPuppeteer() {
    try {
      const tourSpots = await this.tourSpotRepository.find();

      for (const tourSpot of tourSpots) {
        const keyword = tourSpot.title;
        const scrapedData =
          await this.puppeteerService.getSearchContent(keyword);
        console.log(scrapedData);

        await this.tourSpotTagRepository.delete({
          tourSpot: { id: tourSpot.id },
        });

        const tourSpotTagsPromises = scrapedData.flatMap((data) =>
          data.tags.map(async (tagName) => {
            const tourSpotTag = new TourSpotTag();
            let tag = await this.tagRepository.findOne({
              where: { name: tagName },
            });
            if (!tag) {
              tag = this.tagRepository.create({ name: tagName });
              tag = await this.tagRepository.save(tag);
            }
            tourSpotTag.tourSpot = tourSpot;
            tourSpotTag.tag = tag;
            return tourSpotTag;
          }),
        );
        const tourSpotTags = await Promise.all(tourSpotTagsPromises);
        await this.tourSpotTagRepository.save(tourSpotTags);
      }
    } catch (error) {
      throw new Error('여행지 검색에 실패했습니다.');
    }
  }
}
