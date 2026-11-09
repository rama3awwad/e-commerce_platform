import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersApi } from '../users/api/users.api';
import { HttpUsersApi } from './clients/http-users.api';
import { InternalHttpModule } from '../common/internal-http/internal-http.module';
@Module({imports:[InternalHttpModule,PassportModule.register({defaultStrategy:'jwt'}),JwtModule.registerAsync({imports:[ConfigModule],inject:[ConfigService],useFactory:(c:ConfigService)=>({secret:c.get<string>('JWT_SECRET'),signOptions:{expiresIn:c.get<string>('JWT_EXPIRATION','1d')}})})],controllers:[AuthController],providers:[AuthService,JwtStrategy,{provide:UsersApi,useClass:HttpUsersApi}],exports:[AuthService,JwtModule]}) export class AuthModule {}
